use crate::fsutil::meminfo_bytes;
use crate::models::MemoryInfo;
use sysinfo::System;

pub fn collect(system: &System) -> MemoryInfo {
    let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let cached = meminfo_bytes(&meminfo, "Cached");
    let buffers = meminfo_bytes(&meminfo, "Buffers");

    let total = system.total_memory();
    let used = system.used_memory();
    let available = system.available_memory();
    let free = system.free_memory();
    let swap_total = system.total_swap();
    let swap_used = system.used_swap();

    MemoryInfo {
        usage_percent: if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        },
        swap_usage_percent: if swap_total > 0 {
            (swap_used as f32 / swap_total as f32) * 100.0
        } else {
            0.0
        },
        total_bytes: total,
        used_bytes: used,
        available_bytes: available,
        free_bytes: free,
        cached_bytes: cached,
        buffers_bytes: buffers,
        swap_total_bytes: swap_total,
        swap_used_bytes: swap_used,
    }
}
