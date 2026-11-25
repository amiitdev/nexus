//! GPU discovery. NVIDIA is queried through `nvidia-smi` when present;
//! AMD/Intel data comes from DRM sysfs + that card's hwmon device.
//! Missing metrics stay `None` — no guesses.

use crate::fsutil::{parse_f64, read_trimmed};
use crate::models::GpuInfo;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

fn numeric(s: &str) -> Option<f64> {
    let cleaned = s.trim().replace(',', "");
    if cleaned.is_empty() || cleaned.eq_ignore_ascii_case("n/a") || cleaned.eq_ignore_ascii_case("[not supported]") {
        return None;
    }
    parse_f64(&cleaned)
}

/// `nvidia-smi` is comparatively expensive; reuse its result for 3 seconds.
fn nvidia() -> Vec<GpuInfo> {
    static CACHE: OnceLock<Mutex<Option<(Instant, Vec<GpuInfo>)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((when, values)) = guard.as_ref() {
            if when.elapsed() < Duration::from_secs(3) {
                return values.clone();
            }
        }
    }
    let values = nvidia_uncached();
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), values.clone()));
    }
    values
}

fn nvidia_uncached() -> Vec<GpuInfo> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,clocks.sm,power.draw,fan.speed",
            "--format=csv,noheader,nounits",
        ])
        .output();
    let Ok(output) = output else { return Vec::new() };
    if !output.status.success() {
        return Vec::new();
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if f.is_empty() || f[0].is_empty() {
                return None;
            }
            let field = |i: usize| f.get(i).and_then(|v| numeric(v));
            Some(GpuInfo {
                name: f[0].to_string(),
                vendor: "NVIDIA".into(),
                utilization: field(1).map(|v| v as f32),
                temperature_c: field(2),
                memory_used_bytes: field(3).map(|v| (v * 1024.0 * 1024.0) as u64),
                memory_total_bytes: field(4).map(|v| (v * 1024.0 * 1024.0) as u64),
                clock_mhz: field(5),
                power_watts: field(6),
                fan_speed_percent: field(7).map(|v| v as f32),
                source: "nvidia-smi".into(),
            })
        })
        .collect()
}

/// PCI device names rarely change; resolve them once per process.
fn pci_names() -> HashMap<String, String> {
    static CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();
    CACHE.get_or_init(pci_names_uncached).clone()
}

fn pci_names_uncached() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(out) = Command::new("lspci").arg("-nn").output() else {
        return map;
    };
    if !out.status.success() {
        return map;
    }
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let mut parts = line.splitn(2, ' ');
        let (Some(addr), Some(rest)) = (parts.next(), parts.next()) else { continue };
        if !(rest.contains("VGA compatible controller")
            || rest.contains("3D controller")
            || rest.contains("Display controller"))
        {
            continue;
        }
        let name = rest
            .split_once(": ")
            .map(|(_, n)| n)
            .unwrap_or(rest)
            .split(" (rev ")
            .next()
            .unwrap_or(rest)
            .trim()
            .to_string();
        map.insert(addr.trim().to_string(), name);
    }
    map
}

fn pci_address(path: &Path) -> Option<String> {
    let canonical = std::fs::canonicalize(path).ok()?;
    canonical.components().rev().find_map(|c| {
        let s = c.as_os_str().to_string_lossy().into_owned();
        let bytes = s.as_bytes();
        if s.len() == 12
            && bytes[0..4].iter().all(u8::is_ascii_hexdigit)
            && bytes[4] == b':'
            && bytes[5..7].iter().all(u8::is_ascii_hexdigit)
            && bytes[7] == b':'
            && bytes[8..10].iter().all(u8::is_ascii_hexdigit)
            && bytes[10] == b'.'
            && bytes[11].is_ascii_digit()
        {
            Some(s)
        } else {
            None
        }
    })
}

fn hwmon_value(device_dir: &Path, prefix: &str, divisor: f64, label: Option<&str>) -> Option<f64> {
    let hwmon_root = device_dir.join("hwmon");
    let entries = std::fs::read_dir(hwmon_root).ok()?;
    for e in entries.flatten() {
        let dir = e.path();
        let files = std::fs::read_dir(&dir).ok()?;
        for f in files.flatten() {
            let name = f.file_name().to_string_lossy().into_owned();
            if !name.starts_with(prefix) || !name.ends_with("_input") {
                continue;
            }
            if let Some(label) = label {
                let idx = name.trim_start_matches(prefix).trim_end_matches("_input");
                let l = read_trimmed(dir.join(format!("{prefix}{idx}_label"))).unwrap_or_default();
                if !l.to_lowercase().contains(label) {
                    continue;
                }
            }
            if let Some(v) = read_trimmed(f.path()).and_then(|v| parse_f64(&v)) {
                let value = v / divisor;
                if value > 0.0 && value.is_finite() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn drm_gpu(card: &Path, names: &HashMap<String, String>) -> Option<GpuInfo> {
    let dev = card.join("device");
    let addr = pci_address(card)?;
    let vendor_raw = read_trimmed(dev.join("vendor")).unwrap_or_default().to_lowercase();
    let device_id = read_trimmed(dev.join("device")).unwrap_or_default().to_lowercase();

    let (vendor, known) = if vendor_raw.contains("0x1002") {
        ("AMD", true)
    } else if vendor_raw.contains("0x8086") {
        ("Intel", true)
    } else if vendor_raw.contains("0x10de") {
        ("NVIDIA", true)
    } else {
        ("Other", false)
    };
    if !known && device_id.is_empty() {
        return None;
    }

    let name = names.get(&addr).cloned().unwrap_or_else(|| {
        let id = device_id.trim_start_matches("0x");
        format!("{vendor} GPU ({id})")
    });

    let busy = read_trimmed(dev.join("gpu_busy_percent")).and_then(|v| parse_f64(&v));
    let clock = read_trimmed(dev.join("pp_dpm_sclk")).and_then(|s| {
        s.lines()
            .find(|l| l.contains('*'))
            .and_then(|l| {
                let digits: String = l.chars().filter(|c| c.is_ascii_digit()).collect();
                parse_f64(&digits)
            })
    });
    let vram_used = read_trimmed(dev.join("mem_info_vram_used"))
        .and_then(|v| v.parse::<u64>().ok());
    let vram_total = read_trimmed(dev.join("mem_info_vram_total"))
        .and_then(|v| v.parse::<u64>().ok());

    Some(GpuInfo {
        name,
        vendor: vendor.into(),
        utilization: busy.map(|v| v as f32),
        temperature_c: hwmon_value(&dev, "temp", 1000.0, None),
        memory_used_bytes: vram_used,
        memory_total_bytes: vram_total,
        clock_mhz: clock,
        power_watts: hwmon_value(&dev, "power", 1_000_000.0, Some("ppt"))
            .or_else(|| hwmon_value(&dev, "power", 1_000_000.0, None)),
        fan_speed_percent: hwmon_value(&dev, "fan", 1.0, None).map(|v| v as f32),
        source: "sysfs/drm".into(),
    })
}

pub fn collect() -> Vec<GpuInfo> {
    let mut gpus = nvidia();
    let names = pci_names();
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return gpus;
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("card") || !name[4..].chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        // nvidia-smi already covers these; avoid showing them twice.
        if !gpus.is_empty() {
            let addr = pci_address(&entry.path()).unwrap_or_default();
            let vendor = read_trimmed(format!("/sys/bus/pci/devices/{addr}/vendor"))
                .unwrap_or_default();
            if vendor.to_lowercase().contains("0x10de") {
                continue;
            }
        }
        if let Some(gpu) = drm_gpu(&entry.path(), &names) {
            gpus.push(gpu);
        }
    }
    gpus
}
