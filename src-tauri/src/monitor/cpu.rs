use crate::fsutil::{parse_f64, read_first, read_trimmed};
use crate::models::CpuInfo;
use crate::monitor::sensors;
use crate::monitor::{rate_per_second, state};
use std::time::Instant;
use sysinfo::System;

fn cpuinfo_field(field: &str) -> Option<String> {
    let contents = std::fs::read_to_string("/proc/cpuinfo").ok()?;
    contents.lines().find_map(|line| {
        let (k, v) = line.split_once(':')?;
        if k.trim() == field {
            let v = v.trim();
            if v.is_empty() {
                None
            } else {
                Some(v.to_string())
            }
        } else {
            None
        }
    })
}

fn frequency_mhz() -> Option<f64> {
    let mut total = 0.0;
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir("/sys/devices/system/cpu") {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.starts_with("cpu") || !name[3..].chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if let Some(v) = read_trimmed(e.path().join("cpufreq/scaling_cur_freq"))
                .and_then(|s| parse_f64(&s))
            {
                total += v / 1000.0;
                count += 1;
            }
        }
    }
    if count > 0 {
        return Some(total / count as f64);
    }
    cpuinfo_field("cpu MHz").and_then(|v| parse_f64(&v))
}

fn frequency_limits() -> (Option<f64>, Option<f64>) {
    let base = "/sys/devices/system/cpu/cpu0/cpufreq";
    let min = read_trimmed(format!("{base}/scaling_min_freq"))
        .and_then(|v| parse_f64(&v))
        .map(|v| v / 1000.0)
        .or_else(|| read_trimmed("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_min_freq").and_then(|v| parse_f64(&v)).map(|v| v / 1000.0));
    let max = read_trimmed(format!("{base}/scaling_max_freq"))
        .and_then(|v| parse_f64(&v))
        .map(|v| v / 1000.0)
        .or_else(|| read_trimmed("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq").and_then(|v| parse_f64(&v)).map(|v| v / 1000.0));
    (min, max)
}

fn load_average() -> [f64; 3] {
    let mut result = [0.0; 3];
    if let Some(line) = read_trimmed("/proc/loadavg") {
        for (i, part) in line.split_whitespace().take(3).enumerate() {
            if let Ok(v) = part.parse::<f64>() {
                result[i] = v;
            }
        }
    }
    result
}

/// Intel RAPL energy counter (microjoules) — the only no-root CPU power source.
fn intel_package_power() -> Option<f64> {
    let energy = read_first(&[
        "/sys/class/powercap/intel-rapl:0/energy_uj",
        "/sys/class/powercap/intel-rapl:0:0/energy_uj",
    ])
    .and_then(|v| v.parse::<u64>().ok())?;

    let now = Instant::now();
    let mut guard = state().power.lock().ok()?;
    let value = match *guard {
        Some((prev_time, prev_energy)) if energy >= prev_energy => {
            rate_per_second(energy, prev_energy, now.duration_since(prev_time).as_secs_f64())
                .map(|uj_per_s| uj_per_s / 1_000_000.0)
        }
        _ => None,
    };
    *guard = Some((now, energy));
    value
}

pub fn collect(system: &System) -> CpuInfo {
    let (min_freq, max_freq) = frequency_limits();
    let physical = System::physical_core_count().unwrap_or(0);
    let logical = system.cpus().len();
    let physical = if physical == 0 { logical } else { physical };

    CpuInfo {
        model: cpuinfo_field("model name")
            .or_else(|| cpuinfo_field("Hardware"))
            .unwrap_or_else(|| "Not available".into()),
        vendor: cpuinfo_field("vendor_id")
            .or_else(|| cpuinfo_field("Processor"))
            .unwrap_or_else(|| "Not available".into()),
        physical_cores: physical,
        logical_threads: logical,
        usage: system.global_cpu_usage(),
        per_core_usage: system.cpus().iter().map(|c| c.cpu_usage()).collect(),
        frequency_mhz: frequency_mhz(),
        min_frequency_mhz: min_freq,
        max_frequency_mhz: max_freq,
        load_average: load_average(),
        temperature_c: sensors::cpu_temperature(),
        power_watts: intel_package_power().or_else(sensors::amd_package_power),
        architecture: std::env::consts::ARCH.to_string(),
        uptime_seconds: System::uptime(),
    }
}
