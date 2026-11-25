use crate::models::AppSettings;
use std::fs;
use std::path::PathBuf;

fn path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nexus")
        .join("settings.json")
}

pub fn load() -> AppSettings {
    match fs::read_to_string(path()) {
        Ok(json) => serde_json::from_str::<AppSettings>(&json).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save(settings: &AppSettings) -> Result<(), String> {
    let p = path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| format!("Cannot save settings: {e}"))
}

fn autostart_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("autostart")
        .join("nexus.desktop")
}

/// XDG autostart integration — works across all major desktop environments.
pub fn set_launch_at_login(enabled: bool) -> Result<(), String> {
    let p = autostart_path();
    if enabled {
        fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned();
        let contents = format!(
            "[Desktop Entry]\nType=Application\nName=NEXUS\nComment=Linux System Control Center\nExec={exe}\nIcon=nexus\nTerminal=false\nCategories=System;Utility;\nX-GNOME-Autostart-enabled=true\n"
        );
        fs::write(p, contents).map_err(|e| format!("Cannot enable launch at login: {e}"))
    } else {
        match fs::remove_file(p) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Cannot disable launch at login: {e}")),
        }
    }
}
