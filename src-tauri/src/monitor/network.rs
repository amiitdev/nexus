//! Network statistics read straight from the kernel.
//!
//! `/proc/net/dev` holds cumulative byte counters — unlike sysinfo's
//! `NetworkData::received()` which is a delta since the last refresh and is
//! zero on every freshly-created `Networks`. We keep our own previous sample
//! so totals and rates are both real.

use crate::fsutil::read_trimmed;
use crate::models::NetworkInfo;
use crate::monitor::{rate_per_second, state};
use std::net::{IpAddr, UdpSocket};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

fn default_interface() -> String {
    let contents = std::fs::read_to_string("/proc/net/route").unwrap_or_default();
    contents.lines().find_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() > 1 && fields[1] == "00000000" {
            Some(fields[0].to_string())
        } else {
            None
        }
    }).unwrap_or_else(|| {
        std::fs::read_dir("/sys/class/net")
            .ok()
            .and_then(|entries| {
                entries.flatten().find_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    (name != "lo").then_some(name)
                })
            })
            .unwrap_or_else(|| "lo".into())
    })
}

/// Cumulative (received, transmitted) byte counters for one interface.
fn interface_bytes(iface: &str) -> Option<(u64, u64)> {
    let contents = std::fs::read_to_string("/proc/net/dev").ok()?;
    for line in contents.lines().skip(2) {
        let (name, rest) = match line.split_once(':') {
            Some(parts) => parts,
            None => continue,
        };
        if name.trim() != iface {
            continue;
        }
        let fields: Vec<&str> = rest.split_whitespace().collect();
        let rx = fields.first()?.parse::<u64>().ok()?;
        let tx = fields.get(8)?.parse::<u64>().ok()?;
        return Some((rx, tx));
    }
    None
}

/// Local address chosen by the kernel's routing table — no packets are sent.
fn local_ip() -> Option<String> {
    for target in ["8.8.8.8:80", "1.1.1.1:80"] {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    if let IpAddr::V4(v4) = addr.ip() {
                        if !v4.is_loopback() && !v4.is_unspecified() {
                            return Some(v4.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

fn link_state(iface: &str) -> String {
    read_trimmed(format!("/sys/class/net/{iface}/operstate"))
        .unwrap_or_else(|| "unknown".into())
}

struct Wifi {
    is_wireless: bool,
    ssid: Option<String>,
    signal_dbm: Option<i32>,
}

fn wifi_info(iface: &str) -> Wifi {
    let wireless_path = format!("/sys/class/net/{iface}/wireless");
    let wireless_file = Path::new(&wireless_path);
    let in_wireless_table = std::fs::read_to_string("/proc/net/wireless")
        .unwrap_or_default()
        .lines()
        .any(|line| line.trim_start().starts_with(&format!("{iface}:")));
    let is_wireless = wireless_file.exists() || in_wireless_table;
    let mut wifi = Wifi { is_wireless, ssid: None, signal_dbm: None };
    if !is_wireless {
        return wifi;
    }

    if let Ok(output) = Command::new("iw").args(["dev", iface, "link"]).output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let line = line.trim();
                if let Some(ssid) = line.strip_prefix("SSID: ") {
                    wifi.ssid = Some(ssid.trim().to_string());
                }
                if let Some(signal) = line.strip_prefix("signal: ") {
                    wifi.signal_dbm = signal
                        .split_whitespace()
                        .next()
                        .and_then(|value| value.parse::<i32>().ok());
                }
            }
        }
    }

    if wifi.ssid.is_none() {
        if let Ok(output) = Command::new("iwgetid").args(["-r", iface]).output() {
            if output.status.success() {
                let ssid = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !ssid.is_empty() {
                    wifi.ssid = Some(ssid);
                }
            }
        }
    }

    if wifi.signal_dbm.is_none() {
        // WE quality level from /proc/net/wireless, roughly dBm = level - 100.
        let wireless = std::fs::read_to_string("/proc/net/wireless").unwrap_or_default();
        let level = wireless.lines().find_map(|line| {
            let line = line.trim_start();
            if !line.starts_with(&format!("{iface}:")) {
                return None;
            }
            let fields: Vec<&str> = line.split_whitespace().collect();
            fields.get(3).and_then(|v| v.trim_end_matches('.').parse::<i32>().ok())
        });
        wifi.signal_dbm = level.map(|level| level - 100);
    }

    wifi
}

pub fn collect() -> NetworkInfo {
    let iface = default_interface();
    let (received, transmitted) = interface_bytes(&iface).unwrap_or((0, 0));
    let now = Instant::now();

    let (down_rate, up_rate) = match state().net.lock() {
        Ok(mut guard) => {
            let value = match guard.as_ref() {
                Some((previous_time, previous_iface, previous_rx, previous_tx))
                    if *previous_iface == iface =>
                {
                    let elapsed = now.duration_since(*previous_time).as_secs_f64();
                    (
                        rate_per_second(received, *previous_rx, elapsed),
                        rate_per_second(transmitted, *previous_tx, elapsed),
                    )
                }
                _ => (None, None),
            };
            *guard = Some((now, iface.clone(), received, transmitted));
            value
        }
        Err(_) => (None, None),
    };

    let link = link_state(&iface);
    let wifi = wifi_info(&iface);
    let signal_percent = wifi
        .signal_dbm
        .map(|dbm| ((dbm + 100) * 2).clamp(0, 100) as f32);

    NetworkInfo {
        interface: iface,
        ip_address: local_ip(),
        link_status: link,
        download_bytes_per_sec: down_rate.unwrap_or(0.0),
        upload_bytes_per_sec: up_rate.unwrap_or(0.0),
        total_received_bytes: received,
        total_transmitted_bytes: transmitted,
        is_wireless: wifi.is_wireless,
        ssid: wifi.ssid,
        signal_dbm: wifi.signal_dbm,
        signal_percent,
    }
}
