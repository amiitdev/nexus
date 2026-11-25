//! Small, dependency-free helpers for reading Linux pseudo-filesystems.

use std::path::Path;

pub fn read_trimmed(path: impl AsRef<Path>) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn read_first(paths: &[&str]) -> Option<String> {
    paths.iter().find_map(|p| read_trimmed(p))
}

pub fn parse_f64(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok()
}

pub fn parse_u64(s: &str) -> Option<u64> {
    s.trim().parse::<u64>().ok()
}

/// Parses a `key: value unit` line from /proc/meminfo into bytes.
pub fn meminfo_bytes(contents: &str, key: &str) -> Option<u64> {
    contents.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        if parts.next()? != format!("{key}:") {
            return None;
        }
        let kb = parts.next()?.parse::<u64>().ok()?;
        Some(kb.saturating_mul(1024))
    })
}

pub fn key_value_file(path: &str) -> Vec<(String, String)> {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let (k, v) = line.split_once('=')?;
            let v = v.trim().trim_matches('"').to_string();
            Some((k.trim().to_string(), v))
        })
        .collect()
}
