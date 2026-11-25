use crate::fsutil::{key_value_file, read_first, read_trimmed};
use crate::models::SystemInfo;
use sysinfo::System;

pub fn collect() -> SystemInfo {
    let os_release = key_value_file("/etc/os-release");
    let get = |key: &str| {
        os_release
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    };

    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("XDG_SESSION_DESKTOP").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("DESKTOP_SESSION").ok().filter(|s| !s.is_empty()))
        .unwrap_or_default();

    SystemInfo {
        distribution: get("NAME").unwrap_or_else(|| "Not available".into()),
        distro_id: get("ID").unwrap_or_default(),
        version: get("VERSION").or_else(|| get("VERSION_ID")).unwrap_or_default(),
        kernel: read_trimmed("/proc/sys/kernel/osrelease")
            .unwrap_or_else(|| System::kernel_version().unwrap_or_default()),
        desktop_environment: desktop,
        hostname: read_trimmed("/etc/hostname")
            .unwrap_or_else(|| System::host_name().unwrap_or_default()),
        architecture: std::env::consts::ARCH.to_string(),
        bios_vendor: read_trimmed("/sys/class/dmi/id/bios_vendor"),
        bios_version: read_trimmed("/sys/class/dmi/id/bios_version"),
        motherboard: read_first(&[
            "/sys/class/dmi/id/board_name",
            "/sys/class/dmi/id/product_name",
        ]),
        product_name: read_trimmed("/sys/class/dmi/id/product_name"),
    }
}
