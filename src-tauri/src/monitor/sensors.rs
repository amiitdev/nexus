//! hwmon (/sys/class/hwmon) discovery. Unused sensor inputs in hwmon commonly
//! report 0 °C or a 100 °C sentinel — those are discarded rather than shown.

use crate::fsutil::{parse_f64, read_trimmed};
use crate::models::SensorReading;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct HwmonSensor {
    pub chip: String,
    pub label: String,
    pub kind: &'static str,
    pub value: f64,
    pub path: String,
}

fn parse_index(name: &str, prefix: &str) -> Option<u32> {
    name.strip_prefix(prefix)?
        .strip_suffix("_input")?
        .parse::<u32>()
        .ok()
}

fn chip_name(dir: &Path) -> String {
    read_trimmed(dir.join("name"))
        .or_else(|| read_trimmed(dir.join("device/name")))
        .unwrap_or_else(|| {
            dir.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "hwmon".into())
        })
}

/// Short-lived cache: a single snapshot asks for CPU, GPU, disk and fan
/// readings, so re-walking hwmon 5× per second would be wasteful.
pub fn scan_hwmon() -> Vec<HwmonSensor> {
    static CACHE: OnceLock<Mutex<Option<(Instant, Vec<HwmonSensor>)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((when, values)) = guard.as_ref() {
            if when.elapsed() < Duration::from_millis(400) {
                return values.clone();
            }
        }
    }
    let values = scan_uncached();
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), values.clone()));
    }
    values
}

fn scan_uncached() -> Vec<HwmonSensor> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir("/sys/class/hwmon") else {
        return out;
    };

    for entry in entries.flatten() {
        let dir = entry.path();
        let chip = chip_name(&dir);
        let Ok(files) = std::fs::read_dir(&dir) else { continue };

        for file in files.flatten() {
            let fname = file.file_name().to_string_lossy().into_owned();
            let (kind, index, divisor) = if let Some(i) = parse_index(&fname, "temp") {
                ("temp", i, 1000.0)
            } else if let Some(i) = parse_index(&fname, "fan") {
                ("fan", i, 1.0)
            } else if let Some(i) = parse_index(&fname, "power") {
                ("power", i, 1_000_000.0)
            } else {
                continue;
            };

            let Some(raw) = read_trimmed(file.path()).and_then(|v| parse_f64(&v)) else {
                continue;
            };
            if !raw.is_finite() || raw <= 0.0 {
                continue;
            }
            // hwmon uses 100000 m°C as "not connected" sentinel.
            if kind == "temp" && raw >= 100_000.0 {
                continue;
            }
            let value = raw / divisor;
            if kind == "temp" && value > 125.0 {
                continue;
            }

            let label = read_trimmed(dir.join(format!("{kind}{index}_label")))
                .or_else(|| read_trimmed(dir.join(format!("{kind}{index}_name"))))
                .unwrap_or_else(|| format!("{kind}{index}"));

            out.push(HwmonSensor {
                chip: chip.clone(),
                label,
                kind,
                value,
                path: file.path().to_string_lossy().into_owned(),
            });
        }
    }
    out
}

fn matches_any(haystack: &str, needles: &[&str]) -> bool {
    let h = haystack.to_lowercase();
    needles.iter().any(|n| h.contains(n))
}

/// CPU temperature from known CPU sensor chips only. Never falls back to a
/// GPU or NVMe sensor just to fill the field.
pub fn cpu_temperature() -> Option<f64> {
    scan_hwmon()
        .iter()
        .find(|s| {
            s.kind == "temp"
                && matches_any(
                    &s.chip,
                    &["k10temp", "coretemp", "zenpower", "cpu_thermal", "acpi"],
                )
        })
        .map(|s| s.value)
}

pub fn gpu_temperature_gpu(chip: &str) -> Option<f64> {
    scan_hwmon()
        .iter()
        .find(|s| s.kind == "temp" && matches_any(&s.chip, &[chip]))
        .map(|s| s.value)
}

pub fn sensor_readings(kind: &str) -> Vec<SensorReading> {
    let (unit, filter_kind) = match kind {
        "fan" => ("RPM", "fan"),
        "power" => ("W", "power"),
        _ => ("°C", "temp"),
    };
    scan_hwmon()
        .into_iter()
        .filter(|s| s.kind == filter_kind)
        .map(|s| SensorReading {
            label: format!("{} · {}", s.chip, s.label),
            chip: s.chip,
            value: s.value,
            unit: unit.into(),
        })
        .collect()
}

/// AMD exposes package power as `PPT` on the k10temp chip.
pub fn amd_package_power() -> Option<f64> {
    scan_hwmon()
        .iter()
        .find(|s| {
            s.kind == "power"
                && matches_any(&s.chip, &["k10temp", "amdgpu"])
                && matches_any(&s.label, &["ppt", "package"])
        })
        .map(|s| s.value)
}
