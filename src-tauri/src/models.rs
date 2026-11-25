//! Shared data contracts between the Rust core and the TypeScript frontend.
//! Every optional field is genuinely optional: `None` is rendered as
//! "Not available" in the UI and is never replaced by a guessed value.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub label: String,
    pub chip: String,
    pub value: f64,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub model: String,
    pub vendor: String,
    pub physical_cores: usize,
    pub logical_threads: usize,
    pub usage: f32,
    pub per_core_usage: Vec<f32>,
    pub frequency_mhz: Option<f64>,
    pub min_frequency_mhz: Option<f64>,
    pub max_frequency_mhz: Option<f64>,
    pub load_average: [f64; 3],
    pub temperature_c: Option<f64>,
    pub power_watts: Option<f64>,
    pub architecture: String,
    pub uptime_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub free_bytes: u64,
    pub cached_bytes: Option<u64>,
    pub buffers_bytes: Option<u64>,
    pub usage_percent: f32,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_usage_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub utilization: Option<f32>,
    pub temperature_c: Option<f64>,
    pub memory_used_bytes: Option<u64>,
    pub memory_total_bytes: Option<u64>,
    pub clock_mhz: Option<f64>,
    pub power_watts: Option<f64>,
    pub fan_speed_percent: Option<f32>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub usage_percent: f32,
    pub is_root: bool,
    pub temperature_c: Option<f64>,
    pub read_bytes_per_sec: Option<f64>,
    pub write_bytes_per_sec: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub interface: String,
    pub ip_address: Option<String>,
    pub link_status: String,
    pub download_bytes_per_sec: f64,
    pub upload_bytes_per_sec: f64,
    pub total_received_bytes: u64,
    pub total_transmitted_bytes: u64,
    pub is_wireless: bool,
    pub ssid: Option<String>,
    pub signal_dbm: Option<i32>,
    pub signal_percent: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub name: String,
    pub charge_percent: Option<f32>,
    pub health_percent: Option<f32>,
    pub power_watts: Option<f64>,
    pub state: String,
    pub technology: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub distribution: String,
    pub distro_id: String,
    pub version: String,
    pub kernel: String,
    pub desktop_environment: String,
    pub hostname: String,
    pub architecture: String,
    pub bios_vendor: Option<String>,
    pub bios_version: Option<String>,
    pub motherboard: Option<String>,
    pub product_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub timestamp: u64,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub gpus: Vec<GpuInfo>,
    pub storage: Vec<StorageInfo>,
    pub network: NetworkInfo,
    pub system: SystemInfo,
    pub temperatures: Vec<SensorReading>,
    pub fans: Vec<SensorReading>,
    pub batteries: Vec<BatteryInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecItem {
    pub label: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecGroup {
    pub title: String,
    pub icon: String,
    pub items: Vec<SpecItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareDetails {
    pub groups: Vec<SpecGroup>,
    pub temperatures: Vec<SensorReading>,
    pub fans: Vec<SensorReading>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub memory_percent: f32,
    pub user: String,
    pub status: String,
    pub executable: Option<String>,
    pub command: Option<String>,
    pub is_critical: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessList {
    pub timestamp: u64,
    pub total: usize,
    pub processes: Vec<ProcessInfo>,
}

// ---------------------------------------------------------------------------
// Downloads organizer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderRule {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRule {
    pub name: String,
    /// All extensions that belong to this category.
    pub extensions: Vec<String>,
    /// Destination sub-folders. Files whose extension matches no folder go to `Other`.
    pub folders: Vec<FolderRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeSettings {
    pub ignore_hidden: bool,
    pub exclude_incomplete: bool,
    pub categories: Vec<CategoryRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedMove {
    pub name: String,
    pub source: String,
    pub destination: String,
    pub size_bytes: u64,
    pub category: String,
    pub folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category: String,
    pub file_count: usize,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePreview {
    pub id: String,
    pub source_dir: String,
    pub files: Vec<PlannedMove>,
    pub skipped: Vec<SkippedFile>,
    pub category_totals: Vec<CategoryTotal>,
    pub total_files: usize,
    pub total_bytes: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFailure {
    pub source: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeResult {
    pub operation_id: String,
    pub moved_count: usize,
    pub failed: Vec<MoveFailure>,
    pub bytes_moved: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformedMove {
    pub original: String,
    pub destination: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeOperation {
    pub id: String,
    pub timestamp: u64,
    pub source_dir: String,
    pub moves: Vec<PerformedMove>,
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub accent: String,
    pub refresh_interval_ms: u64,
    pub temperature_unit: String,
    pub minimize_to_tray: bool,
    pub launch_at_login: bool,
    pub downloads_dir: Option<String>,
    pub notifications: bool,
    pub ignore_hidden: bool,
    pub exclude_incomplete: bool,
    pub monitor_gpu: bool,
    pub monitor_network: bool,
    pub categories: Vec<CategoryRule>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            accent: "violet".into(),
            refresh_interval_ms: 1500,
            temperature_unit: "C".into(),
            minimize_to_tray: true,
            launch_at_login: false,
            downloads_dir: None,
            notifications: true,
            ignore_hidden: true,
            exclude_incomplete: true,
            monitor_gpu: true,
            monitor_network: true,
            categories: crate::organizer::default_categories(),
        }
    }
}

// ---------------------------------------------------------------------------
// SSH device manager
// ---------------------------------------------------------------------------

/// A saved SSH device. Secrets live in a 0600 file under the XDG data dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SshConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    /// "password", "key" or "agent"
    pub auth_method: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub remote_home: Option<String>,
    /// SHA256 host-key fingerprint accepted by the user on first connect.
    pub fingerprint: Option<String>,
    pub created_at: u64,
}

impl Default for SshConnection {
    fn default() -> Self {
        Self {
            id: format!("ssh-{}", crate::util::now_millis()),
            name: String::new(),
            host: String::new(),
            port: 22,
            username: String::new(),
            auth_method: "password".into(),
            password: None,
            private_key_path: None,
            passphrase: None,
            remote_home: None,
            fingerprint: None,
            created_at: crate::util::now_millis(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectResult {
    pub connected: bool,
    pub needs_trust: bool,
    pub fingerprint: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDeviceStatus {
    pub id: String,
    pub connected: bool,
    pub host: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshFileEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: i64,
    pub permissions: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshListing {
    pub path: String,
    pub entries: Vec<SshFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDetectedHost {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub identity_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTransferProgress {
    pub id: String,
    pub direction: String,
    pub label: String,
    pub transferred: u64,
    pub total: u64,
    pub done: bool,
    pub error: Option<String>,
}
