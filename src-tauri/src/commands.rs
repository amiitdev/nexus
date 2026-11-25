//! Thin Tauri command layer. All real work lives in focused modules.

use crate::models::*;
use crate::{organizer, processes, settings};
use std::sync::{Mutex, MutexGuard, Once, OnceLock};
use std::time::Duration;
use sysinfo::System;

/// CPU percentages (global and per-core) are computed from counter deltas.
/// Keep one `System` alive and prime it once so the very first UI frame is real.
fn snapshot_system() -> MutexGuard<'static, System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    static PRIMED: Once = Once::new();
    let mutex = SYSTEM.get_or_init(|| Mutex::new(System::new_all()));

    PRIMED.call_once(|| {
        if let Ok(mut guard) = mutex.lock() {
            guard.refresh_cpu_usage();
        }
        std::thread::sleep(Duration::from_millis(150));
    });

    let mut guard = mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.refresh_cpu_usage();
    guard.refresh_cpu_frequency();
    guard.refresh_memory();
    guard
}

#[tauri::command]
pub fn get_snapshot() -> Result<SystemSnapshot, String> {
    let guard = snapshot_system();
    let system = &*guard;
    Ok(SystemSnapshot {
        timestamp: crate::util::now_millis(),
        cpu: crate::monitor::cpu::collect(&system),
        memory: crate::monitor::memory::collect(&system),
        gpus: crate::monitor::gpu::collect(),
        storage: crate::monitor::storage::collect(),
        network: crate::monitor::network::collect(),
        system: crate::monitor::system::collect(),
        temperatures: crate::monitor::sensors::sensor_readings("temp"),
        fans: crate::monitor::sensors::sensor_readings("fan"),
        batteries: crate::monitor::battery::collect(),
    })
}

#[tauri::command]
pub fn get_hardware_details() -> Result<HardwareDetails, String> {
    let snapshot = get_snapshot()?;
    Ok(crate::monitor::hardware::details(&snapshot))
}

#[tauri::command]
pub fn list_processes() -> Result<ProcessList, String> {
    Ok(processes::list())
}

#[tauri::command]
pub fn terminate_process(pid: u32, force: bool) -> Result<(), String> {
    if pid <= 2 || pid == std::process::id() {
        return Err("This process cannot be terminated.".into());
    }
    let system = System::new_all();
    let name = system
        .process(sysinfo::Pid::from(pid as usize))
        .map(|p| p.name().to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".into());
    if processes::is_hard_critical(&name) {
        return Err(format!("“{name}” is a critical system process and cannot be terminated."));
    }
    if processes::is_critical(&name) && !force {
        return Err(format!("“{name}” appears to be a system service. Confirm with force to terminate it."));
    }
    let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
    let result = unsafe { libc::kill(pid as i32, signal) };
    if result < 0 {
        return Err(format!("Could not signal process {pid}: {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    settings::load()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings::set_launch_at_login(settings.launch_at_login)?;
    settings::save(&settings)
}

#[tauri::command]
pub fn get_downloads_dir() -> String {
    organizer::default_downloads_dir()
}

#[tauri::command]
pub fn get_desktop_dir() -> String {
    organizer::default_desktop_dir()
}

#[tauri::command]
pub fn get_default_categories() -> Vec<CategoryRule> {
    organizer::default_categories()
}

#[tauri::command]
pub fn preview_organize(
    source_dir: Option<String>,
    settings: Option<OrganizeSettings>,
) -> Result<OrganizePreview, String> {
    let app_settings = settings::load();
    let dir = organizer::read_setting_dir(source_dir.as_deref());
    let organize_settings = settings.unwrap_or(OrganizeSettings {
        ignore_hidden: app_settings.ignore_hidden,
        exclude_incomplete: app_settings.exclude_incomplete,
        categories: app_settings.categories,
    });
    organizer::preview(&dir, &organize_settings)
}

#[tauri::command]
pub fn organize(preview_id: String) -> Result<OrganizeResult, String> {
    organizer::organize(&preview_id)
}

#[tauri::command]
pub fn get_organize_history() -> Vec<OrganizeOperation> {
    organizer::read_history()
}

#[tauri::command]
pub fn undo_operation(operation_id: String) -> Result<(usize, Vec<MoveFailure>), String> {
    organizer::undo(&operation_id)
}

#[tauri::command]
pub fn restore_file(operation_id: String, destination: String) -> Result<(), String> {
    organizer::restore_file(&operation_id, &destination)
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
