use crate::models::{HardwareDetails, SensorReading, SpecGroup, SpecItem, SystemSnapshot};
use crate::util::{human_bytes, human_duration};

fn item(label: &str, value: Option<String>) -> SpecItem {
    SpecItem {
        label: label.into(),
        value: value.filter(|v| !v.is_empty()),
    }
}

fn mhz(value: Option<f64>) -> Option<String> {
    value.map(|v| format!("{v:.0} MHz"))
}

pub fn details(snapshot: &SystemSnapshot) -> HardwareDetails {
    let mut groups: Vec<SpecGroup> = Vec::new();

    groups.push(SpecGroup {
        title: "Processor".into(),
        icon: "cpu".into(),
        items: vec![
            item("Model", Some(snapshot.cpu.model.clone())),
            item("Vendor", Some(snapshot.cpu.vendor.clone())),
            item("Architecture", Some(snapshot.cpu.architecture.clone())),
            item("Physical cores", Some(snapshot.cpu.physical_cores.to_string())),
            item("Logical threads", Some(snapshot.cpu.logical_threads.to_string())),
            item("Current frequency", mhz(snapshot.cpu.frequency_mhz)),
            item("Min frequency", mhz(snapshot.cpu.min_frequency_mhz)),
            item("Max frequency", mhz(snapshot.cpu.max_frequency_mhz)),
            item("Temperature", snapshot.cpu.temperature_c.map(|v| format!("{v:.1} °C"))),
            item("Package power", snapshot.cpu.power_watts.map(|v| format!("{v:.1} W"))),
            item(
                "Load average",
                Some(
                    snapshot
                        .cpu
                        .load_average
                        .iter()
                        .map(|v| format!("{v:.2}"))
                        .collect::<Vec<_>>()
                        .join(" / "),
                ),
            ),
            item("Uptime", Some(human_duration(snapshot.cpu.uptime_seconds))),
        ],
    });

    groups.push(SpecGroup {
        title: "Memory".into(),
        icon: "memory".into(),
        items: vec![
            item("Total", Some(human_bytes(snapshot.memory.total_bytes))),
            item("Used", Some(human_bytes(snapshot.memory.used_bytes))),
            item("Available", Some(human_bytes(snapshot.memory.available_bytes))),
            item("Free", Some(human_bytes(snapshot.memory.free_bytes))),
            item("Cached", snapshot.memory.cached_bytes.map(human_bytes)),
            item("Buffers", snapshot.memory.buffers_bytes.map(human_bytes)),
            item("Swap total", Some(human_bytes(snapshot.memory.swap_total_bytes))),
            item("Swap used", Some(human_bytes(snapshot.memory.swap_used_bytes))),
        ],
    });

    for gpu in &snapshot.gpus {
        groups.push(SpecGroup {
            title: gpu.name.clone(),
            icon: "gpu".into(),
            items: vec![
                item("Vendor", Some(gpu.vendor.clone())),
                item("Data source", Some(gpu.source.clone())),
                item("Utilization", gpu.utilization.map(|v| format!("{v:.0} %"))),
                item("Temperature", gpu.temperature_c.map(|v| format!("{v:.1} °C"))),
                item(
                    "Video memory",
                    match (gpu.memory_used_bytes, gpu.memory_total_bytes) {
                        (Some(used), Some(total)) => {
                            Some(format!("{} / {}", human_bytes(used), human_bytes(total)))
                        }
                        (Some(used), None) => Some(human_bytes(used)),
                        _ => None,
                    },
                ),
                item("Clock", mhz(gpu.clock_mhz)),
                item("Power", gpu.power_watts.map(|v| format!("{v:.1} W"))),
                item("Fan", gpu.fan_speed_percent.map(|v| format!("{v:.0} %"))),
            ],
        });
    }

    groups.push(SpecGroup {
        title: "Motherboard".into(),
        icon: "board".into(),
        items: vec![
            item("Manufacturer", snapshot.system.bios_vendor.clone()),
            item("Board / product", snapshot.system.motherboard.clone()),
            item("Product name", snapshot.system.product_name.clone()),
            item("BIOS version", snapshot.system.bios_version.clone()),
            item("Hostname", Some(snapshot.system.hostname.clone())),
            item("Distribution", Some(snapshot.system.distribution.clone())),
            item("Kernel", Some(snapshot.system.kernel.clone())),
        ],
    });

    for disk in &snapshot.storage {
        groups.push(SpecGroup {
            title: format!("Disk · {}", disk.name),
            icon: "disk".into(),
            items: vec![
                item("Mount point", Some(disk.mount_point.clone())),
                item("Filesystem", Some(disk.file_system.clone())),
                item("Capacity", Some(human_bytes(disk.total_bytes))),
                item("Used", Some(human_bytes(disk.used_bytes))),
                item("Available", Some(human_bytes(disk.available_bytes))),
                item("Temperature", disk.temperature_c.map(|v| format!("{v:.1} °C"))),
            ],
        });
    }

    for battery in &snapshot.batteries {
        groups.push(SpecGroup {
            title: format!("Battery · {}", battery.name),
            icon: "battery".into(),
            items: vec![
                item("Charge", battery.charge_percent.map(|v| format!("{v:.0} %"))),
                item("Health", battery.health_percent.map(|v| format!("{v:.1} %"))),
                item("State", Some(battery.state.clone())),
                item("Technology", Some(battery.technology.clone())),
                item("Power", battery.power_watts.map(|v| format!("{v:.2} W"))),
            ],
        });
    }

    let thermal: Vec<SensorReading> = snapshot.temperatures.clone();
    let fans: Vec<SensorReading> = snapshot.fans.clone();
    let mut sensors: Vec<SpecItem> = thermal
        .iter()
        .take(16)
        .map(|s| item(&s.label, Some(format!("{:.1} {}", s.value, s.unit))))
        .collect();
    sensors.extend(
        fans.iter()
            .take(8)
            .map(|s| item(&s.label, Some(format!("{:.0} {}", s.value, s.unit)))),
    );
    groups.push(SpecGroup {
        title: "Sensors".into(),
        icon: "thermometer".into(),
        items: sensors,
    });

    HardwareDetails {
        groups,
        temperatures: thermal,
        fans,
    }
}
