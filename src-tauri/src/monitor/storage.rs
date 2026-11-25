//! Mounted filesystems from sysinfo plus real I/O rates from /proc/diskstats.

use crate::fsutil::parse_u64;
use crate::models::StorageInfo;
use crate::monitor::{rate_per_second, state};
use std::time::Instant;
use sysinfo::Disks;

const VIRTUAL_FS: &[&str] = &[
    "tmpfs", "devtmpfs", "squashfs", "overlay", "proc", "sysfs", "cgroup", "cgroup2",
    "fusectl", "mqueue", "bpf", "securityfs", "debugfs", "tracefs", "pstore", "ramfs",
    "autofs", "binfmt_misc", "hugetlbfs", "configfs",
];

/// Returns (read bytes/sec, write bytes/sec) summed across physical devices.
fn io_rates() -> (Option<f64>, Option<f64>) {
    let contents = match std::fs::read_to_string("/proc/diskstats") {
        Ok(c) => c,
        Err(_) => return (None, None),
    };

    let (mut read_sectors, mut write_sectors) = (0u64, 0u64);
    for line in contents.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 8 {
            continue;
        }
        let name = parts[2];
        if name.starts_with("loop") || name.starts_with("ram") || name.starts_with("sr") {
            continue;
        }
        if let (Some(r), Some(w)) = (parse_u64(parts[4]), parse_u64(parts[6])) {
            read_sectors = read_sectors.saturating_add(r);
            write_sectors = write_sectors.saturating_add(w);
        }
    }

    let now = Instant::now();
    let Ok(mut guard) = state().disk.lock() else {
        return (None, None);
    };
    let (prev, prev_time) = &mut *guard;
    let result = match prev_time {
        Some(t) => {
            let elapsed = now.duration_since(*t).as_secs_f64();
            (
                prev.get("read")
                    .and_then(|(p, _)| rate_per_second(read_sectors, *p, elapsed))
                    .map(|v| v * 512.0),
                prev.get("write")
                    .and_then(|(p, _)| rate_per_second(write_sectors, *p, elapsed))
                    .map(|v| v * 512.0),
            )
        }
        None => (None, None),
    };
    prev.insert("read".into(), (read_sectors, 0));
    prev.insert("write".into(), (write_sectors, 0));
    *prev_time = Some(now);
    result
}

fn nvme_temperature() -> Option<f64> {
    crate::monitor::sensors::scan_hwmon()
        .iter()
        .find(|s| s.kind == "temp" && s.chip.to_lowercase().contains("nvme"))
        .map(|s| s.value)
}

pub fn collect() -> Vec<StorageInfo> {
    let (read_rate, write_rate) = io_rates();
    let nvme_temp = nvme_temperature();
    let disks = Disks::new_with_refreshed_list();

    let mut result: Vec<StorageInfo> = disks
        .iter()
        .filter_map(|disk| {
            let fs = disk.file_system().to_string_lossy().into_owned();
            if VIRTUAL_FS.contains(&fs.to_lowercase().as_str()) || disk.total_space() == 0 {
                return None;
            }
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let mount = disk.mount_point().to_string_lossy().into_owned();
            let is_root = mount == "/";
            Some(StorageInfo {
                name: disk.name().to_string_lossy().into_owned(),
                mount_point: mount,
                file_system: fs,
                total_bytes: total,
                used_bytes: used,
                available_bytes: available,
                usage_percent: if total > 0 {
                    (used as f32 / total as f32) * 100.0
                } else {
                    0.0
                },
                is_root,
                temperature_c: if is_root { nvme_temp } else { None },
                read_bytes_per_sec: if is_root { read_rate } else { None },
                write_bytes_per_sec: if is_root { write_rate } else { None },
            })
        })
        .collect();

    result.sort_by(|a, b| {
        b.is_root
            .cmp(&a.is_root)
            .then_with(|| b.total_bytes.cmp(&a.total_bytes))
    });
    result
}
