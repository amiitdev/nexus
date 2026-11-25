use crate::models::{ProcessInfo, ProcessList};
use crate::util::{now_millis, user_name};
use std::sync::{Mutex, Once, OnceLock};
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};

/// Process CPU% is derived from CPU-time deltas. A fresh `System` on every
/// request has no previous sample, which made every process report 0.0%.
fn persistent_system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| Mutex::new(System::new_all()))
}


/// Processes that must never be killed without an explicit, informed action.
const HARD_CRITICAL: &[&str] = &[
    "systemd", "init", "kthreadd", "ksoftirqd", "migration", "rcu_sched", "swapper", "idle",
];
const SOFT_CRITICAL: &[&str] = &[
    "xorg", "xwayland", "gnome-shell", "plasmashell", "xfce4-session", "pipewire",
    "networkmanager", "dbus-daemon", "sshd", "systemd-journald",
];

pub fn is_critical(name: &str) -> bool {
    let n = name.to_lowercase();
    HARD_CRITICAL.iter().any(|c| n == *c || n.starts_with(&format!("{c}/")))
        || SOFT_CRITICAL.iter().any(|c| n == *c || n.starts_with(&format!("{c}/")))
}

pub fn is_hard_critical(name: &str) -> bool {
    let n = name.to_lowercase();
    HARD_CRITICAL.iter().any(|c| n == *c || n.starts_with(&format!("{c}/")))
}

pub fn list() -> ProcessList {
    static PRIMED: Once = Once::new();
    let mutex = persistent_system();
    PRIMED.call_once(|| {
        if let Ok(mut guard) = mutex.lock() {
            guard.refresh_processes(ProcessesToUpdate::All, true);
        }
        std::thread::sleep(Duration::from_millis(150));
    });
    let mut guard = mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.refresh_cpu_usage();
    guard.refresh_processes(ProcessesToUpdate::All, true);
    let system = &*guard;
    let total_memory = system.total_memory();
    let processes = system
        .processes()
        .iter()
        .map(|(pid, p)| {
            let name = p.name().to_string_lossy().into_owned();
            let uid = p.user_id().map(|u| **u).unwrap_or(u32::MAX);
            let memory = p.memory();
            ProcessInfo {
                pid: pid.as_u32(),
                name: name.clone(),
                cpu_usage: p.cpu_usage(),
                memory_bytes: memory,
                memory_percent: if total_memory > 0 {
                    (memory as f32 / total_memory as f32) * 100.0
                } else {
                    0.0
                },
                user: if uid == u32::MAX {
                    "unknown".into()
                } else {
                    user_name(uid)
                },
                status: format!("{:?}", p.status()),
                executable: p.exe().map(|p| p.to_string_lossy().into_owned()),
                command: {
                    let parts: Vec<String> = p
                        .cmd()
                        .iter()
                        .map(|s| s.to_string_lossy().into_owned())
                        .collect();
                    (!parts.is_empty()).then(|| parts.join(" "))
                },
                is_critical: is_critical(&name),
            }
        })
        .collect::<Vec<_>>();

    ProcessList {
        timestamp: now_millis(),
        total: processes.len(),
        processes,
    }
}
