//! Safe Downloads organization.
//!
//! Rules enforced here (not just in the UI):
//!  * preview first — no command mutates files without a stored preview id;
//!  * hidden files, symlinks and likely-incomplete downloads are skipped;
//!  * a destination is never overwritten — collisions get a numeric suffix;
//!  * every destination is re-checked immediately before the rename;
//!  * every move is journaled so it can be undone or restored.

use crate::models::{
    CategoryRule, CategoryTotal, FolderRule, OrganizeOperation, OrganizePreview, OrganizeResult,
    OrganizeSettings, PerformedMove, PlannedMove, SkippedFile,
};
use crate::util::now_millis;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const INCOMPLETE_SUFFIXES: &[&str] = &[
    ".part", ".crdownload", ".download", ".partial", ".tmp", ".!ut", ".temp",
];

fn folder(name: &str, extensions: &[&str]) -> FolderRule {
    FolderRule {
        name: name.into(),
        extensions: extensions.iter().map(|s| s.to_string()).collect(),
    }
}

fn category(name: &str, folders: Vec<FolderRule>) -> CategoryRule {
    let extensions = folders
        .iter()
        .flat_map(|f| f.extensions.iter().cloned())
        .collect();
    CategoryRule {
        name: name.into(),
        extensions,
        folders,
    }
}

pub fn default_categories() -> Vec<CategoryRule> {
    vec![
        category(
            "Documents",
            vec![
                folder("PDF", &["pdf"]),
                folder("Word", &["doc", "docx", "odt", "rtf"]),
                folder("Excel", &["xls", "xlsx", "ods", "csv"]),
                folder("Other", &["txt", "md", "ppt", "pptx", "epub", "tex"]),
            ],
        ),
        category(
            "Images",
            vec![
                folder("PNG", &["png"]),
                folder("JPG", &["jpg", "jpeg"]),
                folder("SVG", &["svg"]),
                folder(
                    "Other",
                    &["gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "avif"],
                ),
            ],
        ),
        category(
            "Videos",
            vec![
                folder("MP4", &["mp4"]),
                folder("MKV", &["mkv"]),
                folder("AVI", &["avi"]),
                folder("Other", &["mov", "webm", "flv", "wmv", "m4v", "mpeg", "mpg"]),
            ],
        ),
        category(
            "Audio",
            vec![
                folder("MP3", &["mp3"]),
                folder("WAV", &["wav"]),
                folder("FLAC", &["flac"]),
                folder("Other", &["m4a", "aac", "ogg", "opus", "wma"]),
            ],
        ),
        category(
            "Archives",
            vec![
                folder("ZIP", &["zip"]),
                folder("RAR", &["rar"]),
                folder("7Z", &["7z"]),
                folder("TAR", &["tar", "gz", "bz2", "xz", "tgz", "zst"]),
            ],
        ),
        category(
            "Applications",
            vec![
                folder("DEB", &["deb"]),
                folder("RPM", &["rpm"]),
                folder("AppImage", &["appimage"]),
                folder("Other", &["msi", "exe", "sh", "flatpak", "snap", "run"]),
            ],
        ),
        category(
            "Code",
            vec![
                folder("Python", &["py", "pyw"]),
                folder("JavaScript", &["js", "jsx", "ts", "tsx", "mjs", "cjs"]),
                folder("Java", &["java", "class", "jar"]),
                folder(
                    "Other",
                    &[
                        "rs", "go", "c", "cpp", "cc", "h", "hpp", "json", "html", "css", "yml",
                        "yaml", "toml", "sql", "sh", "php", "rb", "lua", "swift", "kt",
                    ],
                ),
            ],
        ),
    ]
}

fn previews() -> &'static Mutex<HashMap<String, (OrganizePreview, Instant)>> {
    static STORE: OnceLock<Mutex<HashMap<String, (OrganizePreview, Instant)>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn history_path() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("nexus").join("organize-history.json")
}

pub fn default_downloads_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("Downloads"))
                .unwrap_or_else(|| PathBuf::from("Downloads"))
        })
        .to_string_lossy()
        .into_owned()
}

pub fn default_desktop_dir() -> String {
    dirs::desktop_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Desktop")))
        .unwrap_or_else(|| PathBuf::from("Desktop"))
        .to_string_lossy()
        .into_owned()
}

pub fn read_history() -> Vec<OrganizeOperation> {
    let path = history_path();
    match fs::read_to_string(path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn write_history(entries: &[OrganizeOperation]) -> Result<(), String> {
    let path = history_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create history directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Cannot save operation history: {e}"))
}

fn extension_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn is_incomplete(name: &str) -> bool {
    let lower = name.to_lowercase();
    INCOMPLETE_SUFFIXES.iter().any(|s| lower.ends_with(s))
        || lower.contains(".part-")
        || lower.starts_with("~$")
}

/// Chooses a free destination name. `symlink_metadata` means a dangling
/// symlink at the target also counts as occupied.
fn collision_free_dir(target: &Path, name: &str) -> PathBuf {
    let path = Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = path.extension().map(|s| s.to_string_lossy().into_owned());

    let candidate = |n: usize| -> String {
        match (&ext, n) {
            (Some(e), 0) => format!("{stem}.{e}"),
            (Some(e), n) => format!("{stem} ({n}).{e}"),
            (None, 0) => stem.clone(),
            (None, n) => format!("{stem} ({n})"),
        }
    };

    let mut result = target.join(candidate(0));
    let mut n = 1;
    while fs::symlink_metadata(&result).is_ok() {
        result = target.join(candidate(n + 1));
        n += 1;
        if n > 10_000 {
            break;
        }
    }
    result
}

fn destination_for(root: &Path, category: &str, folder: &str, name: &str) -> PathBuf {
    let target_dir = if folder.is_empty() {
        root.join(category)
    } else {
        root.join(category).join(folder)
    };
    collision_free_dir(&target_dir, name)
}

pub fn preview(source_dir: &str, settings: &OrganizeSettings) -> Result<OrganizePreview, String> {
    let root = fs::canonicalize(source_dir)
        .map_err(|e| format!("Cannot open folder “{source_dir}”: {e}"))?;
    if !root.is_dir() {
        return Err("The selected path is not a folder.".into());
    }
    if let Some(home) = dirs::home_dir() {
        if root == home || root.parent().is_none() {
            return Err("For safety, choose a sub-folder such as Downloads, not the home or root directory.".into());
        }
    }

    let mut files = Vec::new();
    let mut skipped = Vec::new();
    let mut totals: HashMap<String, (usize, u64)> = HashMap::new();

    let entries = fs::read_dir(&root).map_err(|e| format!("Cannot read folder: {e}"))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let source = entry.path();

        let meta = match fs::symlink_metadata(&source) {
            Ok(m) => m,
            Err(e) => {
                skipped.push(SkippedFile { name, reason: format!("Unreadable: {e}") });
                continue;
            }
        };
        if meta.file_type().is_symlink() {
            skipped.push(SkippedFile { name, reason: "Symbolic link — skipped for safety".into() });
            continue;
        }
        if meta.is_dir() {
            continue; // already organized, never recurse
        }
        if settings.ignore_hidden && name.starts_with('.') {
            skipped.push(SkippedFile { name, reason: "Hidden file".into() });
            continue;
        }
        if settings.exclude_incomplete && is_incomplete(&name) {
            skipped.push(SkippedFile { name, reason: "Incomplete download".into() });
            continue;
        }

        let ext = extension_of(&name);
        let matched = settings.categories.iter().find(|c| {
            c.extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext))
        });
        let (category_name, folder_name) = match matched {
            Some(c) => {
                let f = c
                    .folders
                    .iter()
                    .find(|f| f.extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)))
                    .map(|f| f.name.clone())
                    .unwrap_or_else(|| "Other".into());
                (c.name.clone(), f)
            }
            None => ("Other".into(), String::new()),
        };

        let destination = destination_for(&root, &category_name, &folder_name, &name);
        let size = meta.len();
        let t = totals.entry(category_name.clone()).or_insert((0, 0));
        t.0 += 1;
        t.1 = t.1.saturating_add(size);

        files.push(PlannedMove {
            name,
            source: source.to_string_lossy().into_owned(),
            destination: destination.to_string_lossy().into_owned(),
            size_bytes: size,
            category: category_name,
            folder: folder_name,
        });
    }

    files.sort_by(|a, b| a.category.cmp(&b.category).then_with(|| a.name.cmp(&b.name)));
    let category_totals: Vec<CategoryTotal> = totals
        .into_iter()
        .map(|(category, (file_count, bytes))| CategoryTotal { category, file_count, bytes })
        .collect();
    let total_bytes = files.iter().fold(0u64, |acc, f| acc.saturating_add(f.size_bytes));

    let mut result = OrganizePreview {
        id: format!("pv-{}-{}", now_millis(), files.len()),
        source_dir: root.to_string_lossy().into_owned(),
        files,
        skipped,
        category_totals,
        total_files: 0,
        total_bytes,
        created_at: now_millis(),
    };
    result.total_files = result.files.len();

    let mut guard = previews().lock().map_err(|_| "Preview store unavailable".to_string())?;
    // Keep the store small.
    guard.retain(|_, (_, t)| t.elapsed().as_secs() < 900);
    guard.insert(result.id.clone(), (result.clone(), Instant::now()));
    Ok(result)
}

fn ensure_inside(root: &Path, path: &Path) -> Result<(), String> {
    let canonical = fs::canonicalize(path)
        .map_err(|e| format!("Cannot verify destination “{}”: {e}", path.display()))?;
    if !canonical.starts_with(root) {
        return Err("Refusing to move a file outside the selected folder.".into());
    }
    Ok(())
}

/// Linux `renameat2(RENAME_NOREPLACE)` makes "never overwrite" atomic.
/// Older kernels fall back to a fresh existence check + plain rename.
fn move_file(source: &Path, destination: &Path) -> Result<(), String> {
    use std::ffi::CString;

    const RENAME_NOREPLACE: libc::c_uint = 1;
    let src = CString::new(source.as_os_str().as_encoded_bytes())
        .map_err(|_| "Source path contains a NUL byte".to_string())?;
    let dst = CString::new(destination.as_os_str().as_encoded_bytes())
        .map_err(|_| "Destination path contains a NUL byte".to_string())?;

    let atomic = unsafe {
        libc::renameat2(libc::AT_FDCWD, src.as_ptr(), libc::AT_FDCWD, dst.as_ptr(), RENAME_NOREPLACE)
    };
    if atomic == 0 {
        return Ok(());
    }
    let err = std::io::Error::last_os_error();
    if err.raw_os_error() != Some(libc::EINVAL) && err.raw_os_error() != Some(libc::ENOSYS) {
        return Err(err.to_string());
    }

    // Fallback for kernels without renameat2 support.
    if fs::symlink_metadata(destination).is_ok() {
        return Err("Destination exists — refusing to overwrite".into());
    }
    fs::rename(source, destination).or_else(|e| {
        if e.kind() == std::io::ErrorKind::CrossesDevices {
            if fs::symlink_metadata(destination).is_ok() {
                return Err("Destination exists — refusing to overwrite".into());
            }
            fs::copy(source, destination)
                .map_err(|copy_err| format!("Copy failed: {copy_err}"))?;
            fs::remove_file(source)
                .map_err(|rm_err| format!("Copy succeeded but source removal failed: {rm_err}"))
        } else {
            Err(e.to_string())
        }
    })
}

pub fn organize(preview_id: &str) -> Result<OrganizeResult, String> {
    let (preview, _) = {
        let mut guard = previews().lock().map_err(|_| "Preview store unavailable".to_string())?;
        guard.remove(preview_id).ok_or_else(|| "This preview has expired. Generate a new one.".to_string())?
    };

    let root = fs::canonicalize(&preview.source_dir)
        .map_err(|e| format!("Cannot open source folder: {e}"))?;
    let mut moves = Vec::new();
    let mut failed = Vec::new();
    let mut bytes_moved = 0u64;

    for planned in &preview.files {
        let source = PathBuf::from(&planned.source);
        let meta = match fs::symlink_metadata(&source) {
            Ok(m) if m.is_file() && !m.file_type().is_symlink() => m,
            Ok(_) => {
                failed.push(crate::models::MoveFailure { source: planned.name.clone(), reason: "Not a regular file".into() });
                continue;
            }
            Err(e) => {
                failed.push(crate::models::MoveFailure { source: planned.name.clone(), reason: e.to_string() });
                continue;
            }
        };
        let original_parent = source.parent().unwrap_or(&root);
        if fs::canonicalize(original_parent).ok().as_deref() != Some(root.as_path()) {
            failed.push(crate::models::MoveFailure {
                source: planned.name.clone(),
                reason: "Source is no longer inside the selected folder".into(),
            });
            continue;
        }

        let target_dir = PathBuf::from(&planned.destination)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| root.clone());
        if let Err(e) = fs::create_dir_all(&target_dir) {
            failed.push(crate::models::MoveFailure { source: planned.name.clone(), reason: e.to_string() });
            continue;
        }
        if let Err(e) = ensure_inside(&root, &target_dir) {
            failed.push(crate::models::MoveFailure { source: planned.name.clone(), reason: e });
            continue;
        }
        // Re-check at the last possible moment — never overwrite.
        let destination = collision_free_dir(&target_dir, &planned.name);
        if let Err(e) = move_file(&source, &destination) {
            failed.push(crate::models::MoveFailure { source: planned.name.clone(), reason: e });
            continue;
        }

        bytes_moved = bytes_moved.saturating_add(meta.len());
        moves.push(PerformedMove {
            original: source.to_string_lossy().into_owned(),
            destination: destination.to_string_lossy().into_owned(),
            size_bytes: meta.len(),
        });
    }

    let operation_id = format!("op-{}", now_millis());
    if !moves.is_empty() {
        let mut history = read_history();
        history.push(OrganizeOperation {
            id: operation_id.clone(),
            timestamp: now_millis(),
            source_dir: preview.source_dir.clone(),
            moves,
        });
        if let Err(e) = write_history(&history) {
            log::error!("Moves succeeded but history could not be saved: {e}");
        }
    }

    let moved_count = preview.total_files.saturating_sub(failed.len());
    Ok(OrganizeResult {
        operation_id,
        moved_count,
        failed,
        bytes_moved,
    })
}

fn reverse_moves(moves: &[PerformedMove]) -> (usize, Vec<crate::models::MoveFailure>) {
    let mut restored = 0;
    let mut failures = Vec::new();
    for record in moves.iter().rev() {
        let current = PathBuf::from(&record.destination);
        let original = PathBuf::from(&record.original);
        if !current.exists() {
            failures.push(crate::models::MoveFailure {
                source: record.destination.clone(),
                reason: "File no longer at organized location".into(),
            });
            continue;
        }
        let Some(parent) = original.parent() else { continue };
        if let Err(e) = fs::create_dir_all(parent) {
            failures.push(crate::models::MoveFailure { source: record.original.clone(), reason: e.to_string() });
            continue;
        }
        let target = collision_free_dir(parent, &original.file_name().unwrap_or_default().to_string_lossy());
        match move_file(&current, &target) {
            Ok(()) => restored += 1,
            Err(e) => failures.push(crate::models::MoveFailure { source: record.original.clone(), reason: e }),
        }
    }
    (restored, failures)
}

pub fn undo(operation_id: &str) -> Result<(usize, Vec<crate::models::MoveFailure>), String> {
    let history = read_history();
    let op = history
        .iter()
        .find(|o| o.id == operation_id)
        .ok_or_else(|| "Operation not found in history.".to_string())?;
    Ok(reverse_moves(&op.moves))
}

pub fn restore_file(operation_id: &str, destination: &str) -> Result<(), String> {
    let history = read_history();
    let op = history
        .iter()
        .find(|o| o.id == operation_id)
        .ok_or_else(|| "Operation not found in history.".to_string())?;
    let record = op
        .moves
        .iter()
        .find(|m| m.destination == destination)
        .ok_or_else(|| "File not found in this operation.".to_string())?;
    let (count, failures) = reverse_moves(std::slice::from_ref(record));
    if count == 0 {
        return Err(failures.first().map(|f| f.reason.clone()).unwrap_or_else(|| "Restore failed".into()));
    }
    Ok(())
}

pub fn read_setting_dir(setting: Option<&str>) -> String {
    setting
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(default_downloads_dir)
}
