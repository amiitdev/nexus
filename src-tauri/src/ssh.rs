//! SSH device manager: saved connections, host-key trust-on-first-use,
//! SFTP browsing and recursive file/folder transfer in both directions.
//!
//! Everything runs locally through libssh2. No external `ssh` or `scp`
//! subprocesses, no cloud relay and no root privileges.

use crate::models::*;
use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use ssh2::{Session, Sftp};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};

/// Live SSH sessions, keyed by saved connection id.
#[derive(Default)]
pub struct SshManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

// ---------------------------------------------------------------------------
// Persistence (0600 — these files can contain passwords / key passphrases)
// ---------------------------------------------------------------------------

fn connections_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("nexus")
        .join("ssh-connections.json")
}

fn write_private_json(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(path)
        .map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    file.write_all(contents.as_bytes())
        .map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

pub fn load_connections() -> Vec<SshConnection> {
    match fs::read_to_string(connections_path()) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn save_connections(connections: &[SshConnection]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(connections).map_err(|e| e.to_string())?;
    write_private_json(&connections_path(), &json)
}

fn save_connection(conn: &SshConnection) -> Result<(), String> {
    let mut all = load_connections();
    if let Some(existing) = all.iter_mut().find(|c| c.id == conn.id) {
        *existing = conn.clone();
    } else {
        all.push(conn.clone());
    }
    save_connections(&all)
}

fn ok_message(err: impl std::fmt::Display) -> String {
    err.to_string()
}

// ---------------------------------------------------------------------------
// Connection / authentication
// ---------------------------------------------------------------------------

fn fingerprint(session: &Session) -> String {
    match session.host_key() {
        Some((key, _kind)) => format!("SHA256:{}", STANDARD_NO_PAD.encode(Sha256::digest(key))),
        None => "Not available".into(),
    }
}

fn handshake(conn: &SshConnection) -> Result<(Session, String), String> {
    if conn.host.trim().is_empty() {
        return Err("Enter the device address (IP or hostname).".into());
    }
    if conn.username.trim().is_empty() {
        return Err("Enter the SSH username.".into());
    }
    let address = format!("{}:{}", conn.host.trim(), conn.port.max(1));
    let stream = TcpStream::connect(&address)
        .map_err(|e| format!("Cannot reach {address}: {e}. Check the address, port and network."))?;
    let mut session = Session::new().map_err(|e| format!("Cannot create SSH session: {e}"))?;
    session.set_tcp_stream(stream);
    session
        .handshake()
        .map_err(|e| format!("SSH handshake with {address} failed: {}", ok_message(e)))?;
    let fp = fingerprint(&session);
    Ok((session, fp))
}

fn authenticate(session: &Session, conn: &SshConnection) -> Result<(), String> {
    let result = match conn.auth_method.as_str() {
        "key" => {
            let key = conn
                .private_key_path
                .as_ref()
                .map(|s| expand_tilde(s.trim()))
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Choose your private key file.".to_string())?;
            if !Path::new(&key).exists() {
                return Err(format!("Private key not found: {key}"));
            }
            let passphrase = conn.passphrase.as_ref().map(|s| s.as_str()).filter(|s| !s.is_empty());
            session.userauth_pubkey_file(&conn.username, None, Path::new(&key), passphrase)
        }
        "agent" => session.userauth_agent(&conn.username),
        _ => {
            let password = conn.password.as_deref().unwrap_or("");
            if password.is_empty() {
                return Err("Enter the password (or choose key / agent authentication).".into());
            }
            session.userauth_password(&conn.username, password)
        }
    };
    result.map_err(|e| format!("Authentication failed: {}", ok_message(e)))?;
    if !session.authenticated() {
        return Err("Authentication failed: the device rejected these credentials.".into());
    }
    Ok(())
}

fn check_host_key(conn: &SshConnection, fp: &str) -> Result<(), String> {
    match conn.fingerprint.as_deref() {
        None => Ok(()),
        Some(trusted) if trusted == fp => Ok(()),
        Some(other) => Err(format!(
            "HOST KEY CHANGED for {} — the device may have been replaced or attacked. \
             Remove and re-add it only after verifying physically. Expected {other}, got {fp}.",
            conn.host
        )),
    }
}

fn store_session(manager: &State<'_, SshManager>, conn: &SshConnection) -> Result<Arc<Mutex<Session>>, String> {
    let mut sessions = manager
        .sessions
        .lock()
        .map_err(|_| "SSH session table is unavailable.".to_string())?;
    if let Some(existing) = sessions.get(&conn.id) {
        return Ok(Arc::clone(existing));
    }
    let (session, fp) = handshake(conn)?;
    if conn.fingerprint.is_none() {
        return Err("Trust this device's host key before browsing it.".into());
    }
    check_host_key(conn, &fp)?;
    authenticate(&session, conn)?;
    let arc = Arc::new(Mutex::new(session));
    sessions.insert(conn.id.clone(), Arc::clone(&arc));
    Ok(arc)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn expand_tilde(input: &str) -> String {
    if input == "~" || input.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return input.replacen('~', &home.to_string_lossy(), 1);
        }
    }
    input.to_string()
}

fn safe_name(path: &Path) -> Result<String, String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(format!("Unsafe file name in path: {}", path.display()));
    }
    Ok(name)
}

fn unix_perm(perm: Option<u32>) -> Option<String> {
    perm.map(|p| format!("{:o}", p & 0o7777))
}

fn stat_to_entry(path: &Path, name: String, stat: &ssh2::FileStat) -> SshFileEntry {
    let kind = if stat.file_type().is_dir() {
        "dir"
    } else if stat.file_type().is_symlink() {
        "link"
    } else if stat.file_type().is_file() {
        "file"
    } else {
        "other"
    };
    SshFileEntry {
        name,
        path: path.to_string_lossy().into_owned(),
        kind: kind.into(),
        size: stat.size.unwrap_or(0),
        modified: stat.mtime.unwrap_or(0) as i64,
        permissions: unix_perm(stat.perm),
    }
}

fn emit(app: &AppHandle, progress: &SshTransferProgress) {
    let _ = app.emit("ssh-transfer", progress.clone());
}

fn ensure_remote_dirs(sftp: &Sftp, path: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        let s = current.to_string_lossy();
        if s.is_empty() || s == "/" {
            continue;
        }
        // Existing components (including "." and the remote home) are fine.
        if sftp.stat(Path::new(s.as_ref())).is_ok() {
            continue;
        }
        sftp.mkdir(Path::new(s.as_ref()), 0o755)
            .map_err(|e| format!("Cannot create remote folder {s}: {}", ok_message(e)))?;
    }
    Ok(())
}

fn remote_total_size(sftp: &Sftp, path: &Path, depth: usize) -> Result<u64, String> {
    if depth > 48 {
        return Ok(0);
    }
    let stat = sftp.stat(path).map_err(|e| ok_message(e))?;
    if stat.file_type().is_dir() {
        let mut total = 0u64;
        for (child, _) in sftp.readdir(path).map_err(|e| ok_message(e))? {
            total = total.saturating_add(remote_total_size(sftp, &child, depth + 1)?);
        }
        Ok(total)
    } else {
        Ok(stat.size.unwrap_or(0))
    }
}

fn download_item(
    app: &AppHandle,
    sftp: &Sftp,
    remote: &Path,
    local_dir: &Path,
    id: &str,
    direction: &str,
    label: &str,
    transferred: &mut u64,
    total: u64,
) -> Result<(), String> {
    let name = safe_name(remote)?;
    let local = local_dir.join(&name);
    let stat = sftp.stat(remote).map_err(|e| ok_message(e))?;

    if stat.file_type().is_dir() {
        fs::create_dir_all(&local).map_err(|e| format!("Cannot create {}: {e}", local.display()))?;
        for (child, _) in sftp.readdir(remote).map_err(|e| ok_message(e))? {
            download_item(app, sftp, &child, &local, id, direction, label, transferred, total)?;
        }
        return Ok(());
    }

    let mut source = sftp.open(remote).map_err(|e| ok_message(e))?;
    let mut target = File::create(&local).map_err(|e| format!("Cannot create {}: {e}", local.display()))?;
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let read = source.read(&mut buffer).map_err(|e| ok_message(e))?;
        if read == 0 {
            break;
        }
        target.write_all(&buffer[..read]).map_err(|e| ok_message(e))?;
        *transferred = transferred.saturating_add(read as u64);
        emit(
            app,
            &SshTransferProgress {
                id: id.into(),
                direction: direction.into(),
                label: label.into(),
                transferred: *transferred,
                total,
                done: false,
                error: None,
            },
        );
    }
    Ok(())
}

fn upload_item(
    app: &AppHandle,
    sftp: &Sftp,
    local: &Path,
    remote_dir: &Path,
    id: &str,
    label: &str,
    transferred: &mut u64,
    total: u64,
) -> Result<(), String> {
    let name = safe_name(local)?;
    let remote = remote_dir.join(&name);
    let meta = fs::symlink_metadata(local).map_err(|e| format!("Cannot read {}: {e}", local.display()))?;
    let path_string = remote.to_string_lossy().into_owned();

    if meta.file_type().is_symlink() {
        return Err(format!("Skipped symbolic link: {}", local.display()));
    }
    if meta.is_dir() {
        ensure_remote_dirs(sftp, &remote)?;
        for entry in fs::read_dir(local).map_err(|e| ok_message(e))? {
            let child = entry.map_err(|e| ok_message(e))?.path();
            upload_item(app, sftp, &child, &remote, id, label, transferred, total)?;
        }
        return Ok(());
    }
    if !meta.is_file() {
        return Err(format!("Skipped special file: {}", local.display()));
    }

    ensure_remote_dirs(sftp, remote_dir)?;
    let mut source = File::open(local).map_err(|e| format!("Cannot read {}: {e}", local.display()))?;
    let mut target = sftp
        .create(Path::new(&path_string))
        .map_err(|e| format!("Cannot write remote {path_string}: {}", ok_message(e)))?;
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let read = source.read(&mut buffer).map_err(|e| ok_message(e))?;
        if read == 0 {
            break;
        }
        target.write_all(&buffer[..read]).map_err(|e| ok_message(e))?;
        *transferred = transferred.saturating_add(read as u64);
        emit(
            app,
            &SshTransferProgress {
                id: id.into(),
                direction: "upload".into(),
                label: label.into(),
                transferred: *transferred,
                total,
                done: false,
                error: None,
            },
        );
    }
    Ok(())
}

fn local_total_size(path: &Path, depth: usize) -> u64 {
    if depth > 48 {
        return 0;
    }
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => fs::read_dir(path)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|e| local_total_size(&e.path(), depth + 1))
                    .sum()
            })
            .unwrap_or(0),
        Ok(meta) => meta.len(),
        Err(_) => 0,
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ssh_list_connections() -> Result<Vec<SshConnection>, String> {
    Ok(load_connections())
}

#[tauri::command]
pub fn ssh_save_connection(connection: SshConnection) -> Result<Vec<SshConnection>, String> {
    if connection.name.trim().is_empty() || connection.host.trim().is_empty() {
        return Err("A name and host address are required.".into());
    }
    save_connection(&connection)?;
    Ok(load_connections())
}

#[tauri::command]
pub fn ssh_delete_connection(id: String, manager: State<'_, SshManager>) -> Result<Vec<SshConnection>, String> {
    if let Ok(mut sessions) = manager.sessions.lock() {
        sessions.remove(&id);
    }
    let kept: Vec<SshConnection> = load_connections().into_iter().filter(|c| c.id != id).collect();
    save_connections(&kept)?;
    Ok(kept)
}

#[tauri::command]
pub fn ssh_detected_hosts() -> Result<Vec<SshDetectedHost>, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let config = home.join(".ssh").join("config");
    let text = match fs::read_to_string(config) {
        Ok(text) => text,
        Err(_) => return Ok(Vec::new()),
    };
    let mut found = Vec::new();
    let mut current: Option<SshDetectedHost> = None;

    let flush = |current: &mut Option<SshDetectedHost>, found: &mut Vec<SshDetectedHost>| {
        if let Some(host) = current.take() {
            if !host.host.is_empty() && !host.name.is_empty() {
                found.push(host);
            }
        }
    };

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.len() >= 4 && line[..4].eq_ignore_ascii_case("host") && line[4..].starts_with(char::is_whitespace) {
            flush(&mut current, &mut found);
            let pattern = line[4..].trim().split_whitespace().next().unwrap_or("").to_string();
            if pattern.is_empty() || pattern.contains('*') || pattern.contains('?') {
                continue;
            }
            current = Some(SshDetectedHost {
                name: pattern,
                host: String::new(),
                port: 22,
                username: String::new(),
                identity_file: None,
            });
            continue;
        }
        if let Some(host) = current.as_mut() {
            let mut parts = line.splitn(2, char::is_whitespace);
            let key = parts.next().unwrap_or("").to_ascii_lowercase();
            let value = parts.next().unwrap_or("").trim().to_string();
            match key.as_str() {
                "hostname" => host.host = value,
                "port" => host.port = value.parse().unwrap_or(22),
                "user" => host.username = value,
                "identityfile" => host.identity_file = Some(expand_tilde(&value)),
                _ => {}
            }
        }
    }
    flush(&mut current, &mut found);
    Ok(found)
}

#[tauri::command]
pub fn ssh_suggest_key() -> Result<Option<String>, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    for name in ["id_ed25519", "id_rsa", "id_ecdsa", "identity"] {
        let path = home.join(".ssh").join(name);
        if path.is_file() {
            return Ok(Some(path.to_string_lossy().into_owned()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn ssh_test_connection(connection: SshConnection) -> Result<SshConnectResult, String> {
    let (session, fp) = handshake(&connection)?;
    if connection.fingerprint.is_none() {
        return Ok(SshConnectResult {
            connected: false,
            needs_trust: true,
            fingerprint: Some(fp),
            error: Some("Verify the fingerprint, then choose Trust & connect.".into()),
        });
    }
    check_host_key(&connection, &fp)?;
    authenticate(&session, &connection)?;
    Ok(SshConnectResult {
        connected: true,
        needs_trust: false,
        fingerprint: Some(fp),
        error: None,
    })
}

#[tauri::command]
pub fn ssh_accept_host_key(
    connection: SshConnection,
    fingerprint: String,
    manager: State<'_, SshManager>,
) -> Result<SshConnectResult, String> {
    let mut trusted = connection;
    trusted.fingerprint = Some(fingerprint.clone());
    save_connection(&trusted)?;
    store_session(&manager, &trusted)?;
    Ok(SshConnectResult {
        connected: true,
        needs_trust: false,
        fingerprint: Some(fingerprint),
        error: None,
    })
}

#[tauri::command]
pub fn ssh_connect(connection: SshConnection, manager: State<'_, SshManager>) -> Result<SshConnectResult, String> {
    if connection.fingerprint.is_none() {
        let (_session, fp) = handshake(&connection)?;
        return Ok(SshConnectResult {
            connected: false,
            needs_trust: true,
            fingerprint: Some(fp),
            error: Some("Verify this fingerprint on your device, then trust it to continue.".into()),
        });
    }
    store_session(&manager, &connection)?;
    Ok(SshConnectResult {
        connected: true,
        needs_trust: false,
        fingerprint: connection.fingerprint,
        error: None,
    })
}

#[tauri::command]
pub fn ssh_disconnect(id: String, manager: State<'_, SshManager>) -> Result<Vec<SshDeviceStatus>, String> {
    if let Ok(mut sessions) = manager.sessions.lock() {
        sessions.remove(&id);
    }
    ssh_statuses(manager)
}

#[tauri::command]
pub fn ssh_statuses(manager: State<'_, SshManager>) -> Result<Vec<SshDeviceStatus>, String> {
    let sessions = manager
        .sessions
        .lock()
        .map_err(|_| "SSH session table is unavailable.".to_string())?;
    Ok(load_connections()
        .into_iter()
        .map(|c| SshDeviceStatus {
            connected: sessions.contains_key(&c.id),
            id: c.id,
            host: c.host,
            username: c.username,
        })
        .collect())
}

#[tauri::command]
pub fn ssh_list_dir(
    manager: State<'_, SshManager>,
    connection: SshConnection,
    path: String,
) -> Result<SshListing, String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    let requested = if path.trim().is_empty() {
        connection
            .remote_home
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| ".".into())
    } else {
        expand_tilde(&path)
    };
    let dir = sftp
        .realpath(Path::new(&requested))
        .unwrap_or_else(|_| PathBuf::from(&requested));
    let mut entries: Vec<SshFileEntry> = sftp
        .readdir(&dir)
        .map_err(|e| ok_message(e))?
        .into_iter()
        .filter_map(|(path, stat)| {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if name.is_empty() || name == "." || name == ".." {
                None
            } else {
                Some(stat_to_entry(&path, name, &stat))
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        let a_dir = a.kind == "dir";
        let b_dir = b.kind == "dir";
        b_dir.cmp(&a_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(SshListing {
        path: dir.to_string_lossy().into_owned(),
        entries,
    })
}

#[tauri::command]
pub fn ssh_create_dir(
    manager: State<'_, SshManager>,
    connection: SshConnection,
    path: String,
) -> Result<(), String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    ensure_remote_dirs(&sftp, Path::new(&path))
}

#[tauri::command]
pub fn ssh_delete_remote(
    manager: State<'_, SshManager>,
    connection: SshConnection,
    path: String,
) -> Result<(), String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    let target = Path::new(&path);
    let stat = sftp.stat(target).map_err(|e| ok_message(e))?;
    if stat.file_type().is_dir() {
        sftp.rmdir(target)
            .map_err(|e| format!("Cannot remove folder (is it empty?): {}", ok_message(e)))
    } else {
        sftp.unlink(target).map_err(|e| ok_message(e))
    }
}

#[tauri::command]
pub fn ssh_rename_remote(
    manager: State<'_, SshManager>,
    connection: SshConnection,
    from: String,
    to: String,
) -> Result<(), String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    sftp.rename(Path::new(&from), Path::new(&to), None)
        .map_err(|e| ok_message(e))
}

#[tauri::command]
pub fn ssh_read_file(
    manager: State<'_, SshManager>,
    connection: SshConnection,
    path: String,
    max_bytes: usize,
) -> Result<String, String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    let mut file = sftp.open(Path::new(&path)).map_err(|e| ok_message(e))?;
    let mut bytes = vec![0u8; max_bytes.min(2 * 1024 * 1024)];
    let read = file.read(&mut bytes).map_err(|e| ok_message(e))?;
    bytes.truncate(read);
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn ssh_download(
    app: AppHandle,
    manager: State<'_, SshManager>,
    connection: SshConnection,
    paths: Vec<String>,
    local_dir: String,
) -> Result<Vec<SshTransferProgress>, String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    let destination = PathBuf::from(expand_tilde(&local_dir));
    if !destination.is_dir() {
        return Err(format!("Local destination is not a folder: {}", destination.display()));
    }
    let id = format!("dl-{}", crate::util::now_millis());
    let total: u64 = paths
        .iter()
        .filter_map(|p| remote_total_size(&sftp, Path::new(p), 0).ok())
        .sum();
    let mut transferred = 0u64;
    let mut results = Vec::new();
    for remote in &paths {
        let path = Path::new(remote);
        let label = safe_name(path)?;
        match download_item(&app, &sftp, path, &destination, &id, "download", &label, &mut transferred, total) {
            Ok(()) => results.push(SshTransferProgress {
                id: id.clone(),
                direction: "download".into(),
                label,
                transferred,
                total,
                done: true,
                error: None,
            }),
            Err(e) => results.push(SshTransferProgress {
                id: id.clone(),
                direction: "download".into(),
                label,
                transferred,
                total,
                done: true,
                error: Some(e),
            }),
        }
    }
    for progress in &results {
        emit(&app, progress);
    }
    Ok(results)
}

#[tauri::command]
pub fn ssh_upload(
    app: AppHandle,
    manager: State<'_, SshManager>,
    connection: SshConnection,
    paths: Vec<String>,
    remote_dir: String,
) -> Result<Vec<SshTransferProgress>, String> {
    let session_arc = store_session(&manager, &connection)?;
    let session = session_arc
        .lock()
        .map_err(|_| "SSH session is busy. Retry in a moment.".to_string())?;
    let sftp = session.sftp().map_err(|e| ok_message(e))?;
    let destination = if remote_dir.trim().is_empty() {
        PathBuf::from(".")
    } else {
        PathBuf::from(expand_tilde(&remote_dir))
    };
    ensure_remote_dirs(&sftp, &destination)?;
    let id = format!("ul-{}", crate::util::now_millis());
    let total: u64 = paths
        .iter()
        .map(|p| local_total_size(Path::new(p), 0))
        .sum();
    let mut transferred = 0u64;
    let mut results = Vec::new();
    for local in &paths {
        let path = Path::new(local);
        let label = safe_name(path)?;
        match upload_item(&app, &sftp, path, &destination, &id, &label, &mut transferred, total) {
            Ok(()) => results.push(SshTransferProgress {
                id: id.clone(),
                direction: "upload".into(),
                label,
                transferred,
                total,
                done: true,
                error: None,
            }),
            Err(e) => results.push(SshTransferProgress {
                id: id.clone(),
                direction: "upload".into(),
                label,
                transferred,
                total,
                done: true,
                error: Some(e),
            }),
        }
    }
    for progress in &results {
        emit(&app, progress);
    }
    Ok(results)
}

// ---------------------------------------------------------------------------
// Local pane helpers (no extra plugin needed — plain std::fs)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn ssh_local_home() -> Result<String, String> {
    Ok(dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn ssh_local_list(path: String) -> Result<SshListing, String> {
    let dir = PathBuf::from(expand_tilde(&path));
    if !dir.is_dir() {
        return Err(format!("Not a folder: {}", dir.display()));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| ok_message(e))? {
        let entry = entry.map_err(|e| ok_message(e))?;
        let meta = match fs::symlink_metadata(entry.path()) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let kind = if meta.file_type().is_symlink() {
            "link"
        } else if meta.is_dir() {
            "dir"
        } else if meta.is_file() {
            "file"
        } else {
            "other"
        };
        #[cfg(unix)]
        let permissions = Some(format!("{:o}", meta.mode() & 0o7777));
        #[cfg(not(unix))]
        let permissions = None;
        entries.push(SshFileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            kind: kind.into(),
            size: meta.len(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0),
            permissions,
        });
    }
    entries.sort_by(|a, b| {
        let a_dir = a.kind == "dir";
        let b_dir = b.kind == "dir";
        b_dir.cmp(&a_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(SshListing {
        path: dir.to_string_lossy().into_owned(),
        entries,
    })
}

#[tauri::command]
pub fn ssh_local_create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(expand_tilde(&path)).map_err(|e| ok_message(e))
}

#[tauri::command]
pub fn ssh_local_delete(path: String) -> Result<(), String> {
    let path = PathBuf::from(expand_tilde(&path));
    let meta = fs::symlink_metadata(&path).map_err(|e| ok_message(e))?;
    if meta.is_dir() {
        fs::remove_dir(&path).map_err(|e| format!("Folder must be empty before deleting: {e}"))
    } else {
        fs::remove_file(&path).map_err(|e| ok_message(e))
    }
}
