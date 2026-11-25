use crate::fsutil::{parse_f64, read_trimmed};
use crate::models::BatteryInfo;

pub fn collect() -> Vec<BatteryInfo> {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("BAT") {
                return None;
            }
            let dir = entry.path();
            let charge = read_trimmed(dir.join("capacity"))
                .and_then(|v| parse_f64(&v))
                .map(|v| v as f32);
            let state = read_trimmed(dir.join("status")).unwrap_or_else(|| "Unknown".into());

            let health = [("energy_full", "energy_full_design"), ("charge_full", "charge_full_design")]
                .iter()
                .find_map(|(full, design)| {
                    let f = read_trimmed(dir.join(full)).and_then(|v| parse_f64(&v))?;
                    let d = read_trimmed(dir.join(design)).and_then(|v| parse_f64(&v))?;
                    if d > 0.0 {
                        Some(((f / d) * 100.0) as f32)
                    } else {
                        None
                    }
                });
            let power = read_trimmed(dir.join("power_now"))
                .and_then(|v| parse_f64(&v))
                .map(|v| v / 1_000_000.0);

            Some(BatteryInfo {
                name,
                charge_percent: charge,
                health_percent: health,
                power_watts: power,
                state,
                technology: read_trimmed(dir.join("technology")).unwrap_or_default(),
            })
        })
        .collect()
}
