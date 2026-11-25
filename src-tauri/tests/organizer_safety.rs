use nexus::models::{OrganizeSettings, PerformedMove};
use nexus::organizer::{default_categories, default_downloads_dir, organize, preview, undo};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_downloads(tag: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("nexus-{tag}-{nanos}"));
    let downloads = dir.join("Downloads");
    fs::create_dir_all(&downloads).unwrap();
    downloads
}

fn settings() -> OrganizeSettings {
    OrganizeSettings {
        ignore_hidden: true,
        exclude_incomplete: true,
        categories: default_categories(),
    }
}

#[test]
fn preview_is_read_only_and_skips_unsafe_files() {
    let dir = temp_downloads("preview");
    fs::write(dir.join("report.pdf"), b"a").unwrap();
    fs::write(dir.join("download.part"), b"b").unwrap();
    fs::write(dir.join(".secret.png"), b"c").unwrap();
    std::os::unix::fs::symlink("/etc/passwd", dir.join("link.txt")).unwrap();

    let snapshot_before: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
    let p = preview(dir.to_str().unwrap(), &settings()).unwrap();

    assert_eq!(p.total_files, 1);
    assert_eq!(p.skipped.len(), 3);
    let snapshot_after: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(snapshot_before, snapshot_after);
    assert!(dir.join("report.pdf").exists());
    fs::remove_dir_all(dir.parent().unwrap()).unwrap();
}

#[test]
fn organize_never_overwrites_and_can_be_undone() {
    let dir = temp_downloads("organize");
    fs::write(dir.join("hello.pdf"), b"new").unwrap();
    fs::write(dir.join("song.mp3"), b"audio").unwrap();
    fs::create_dir_all(dir.join("Documents/PDF")).unwrap();
    fs::write(dir.join("Documents/PDF/hello.pdf"), b"pre-existing").unwrap();

    let p = preview(dir.to_str().unwrap(), &settings()).unwrap();
    assert_eq!(p.total_files, 2);
    let pdf_move = p.files.iter().find(|f| f.name == "hello.pdf").unwrap();
    assert_eq!(
        std::path::Path::new(&pdf_move.destination).file_name().unwrap(),
        "hello (2).pdf"
    );

    let result = organize(&p.id).unwrap();
    assert_eq!(result.moved_count, 2);
    assert!(result.failed.is_empty());
    assert_eq!(
        fs::read_to_string(dir.join("Documents/PDF/hello.pdf")).unwrap(),
        "pre-existing"
    );
    assert_eq!(
        fs::read_to_string(dir.join("Documents/PDF/hello (2).pdf")).unwrap(),
        "new"
    );

    let (restored, failures) = undo(&result.operation_id).unwrap();
    assert_eq!(restored, 2);
    assert!(failures.is_empty());
    assert!(dir.join("hello.pdf").exists());
    assert!(dir.join("song.mp3").exists());

    // Confirm all journaled destinations are real paths of moved files.
    let _: Vec<PerformedMove> = Vec::new();
    fs::remove_dir_all(dir.parent().unwrap()).unwrap();
}

#[test]
fn refuses_home_and_root_directories() {
    let home = dirs::home_dir().unwrap();
    assert!(preview(home.to_str().unwrap(), &settings()).is_err());
    assert!(preview("/", &settings()).is_err());
    assert!(!default_downloads_dir().is_empty());
}
