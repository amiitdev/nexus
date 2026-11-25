pub mod battery;
pub mod cpu;
pub mod gpu;
pub mod hardware;
pub mod memory;
pub mod network;
pub mod sensors;
pub mod storage;
pub mod system;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// Rate calculations need the previous sample. Kept in-process so the
/// frontend never has to guess or synthesize a delta.
pub struct MonitorState {
    pub net: Mutex<Option<(Instant, String, u64, u64)>>,
    pub disk: Mutex<(HashMap<String, (u64, u64)>, Option<Instant>)>,
    pub power: Mutex<Option<(Instant, u64)>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            net: Mutex::new(None),
            disk: Mutex::new((HashMap::new(), None)),
            power: Mutex::new(None),
        }
    }
}

pub fn state() -> &'static MonitorState {
    static STATE: OnceLock<MonitorState> = OnceLock::new();
    STATE.get_or_init(MonitorState::default)
}

pub fn rate_per_second(current: u64, previous: u64, elapsed_secs: f64) -> Option<f64> {
    if elapsed_secs <= 0.0 || current < previous {
        return None;
    }
    Some((current - previous) as f64 / elapsed_secs)
}
