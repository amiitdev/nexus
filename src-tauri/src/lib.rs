pub mod commands;
pub mod fsutil;
pub mod models;
pub mod monitor;
pub mod organizer;
pub mod processes;
pub mod settings;
pub mod ssh;
pub mod util;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder};
use tauri::{Manager, WindowEvent};

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ssh::SshManager::default())
        .setup(|app| {
            // System tray: hide on close when the user opted in.
            let show = MenuItem::with_id(app, "show", "Show NEXUS", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit NEXUS", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = TrayIconBuilder::with_id("nexus-tray")
                    .icon(icon)
                    .menu(&menu)
                    .tooltip("NEXUS — System Control Center")
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app);
            }

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if settings::load().minimize_to_tray {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_hardware_details,
            commands::list_processes,
            commands::terminate_process,
            commands::get_settings,
            commands::save_settings,
            commands::get_downloads_dir,
            commands::get_desktop_dir,
            commands::get_default_categories,
            commands::preview_organize,
            commands::organize,
            commands::get_organize_history,
            commands::undo_operation,
            commands::restore_file,
            commands::get_app_version,
            ssh::ssh_list_connections,
            ssh::ssh_save_connection,
            ssh::ssh_delete_connection,
            ssh::ssh_detected_hosts,
            ssh::ssh_suggest_key,
            ssh::ssh_test_connection,
            ssh::ssh_accept_host_key,
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            ssh::ssh_statuses,
            ssh::ssh_list_dir,
            ssh::ssh_create_dir,
            ssh::ssh_delete_remote,
            ssh::ssh_rename_remote,
            ssh::ssh_read_file,
            ssh::ssh_download,
            ssh::ssh_upload,
            ssh::ssh_local_home,
            ssh::ssh_local_list,
            ssh::ssh_local_create_dir,
            ssh::ssh_local_delete,
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch NEXUS");
}
