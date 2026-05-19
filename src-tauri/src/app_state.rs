use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct KeylogConfig {
    pub enabled: bool,
    pub path: Option<String>,
    pub format: KeylogFormat,
    pub redaction_patterns: Vec<String>,
    pub discard_unattributed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum KeylogFormat {
    Plain,
    Jsonl,
    Timestamped,
}

impl Default for KeylogFormat {
    fn default() -> Self {
        Self::Timestamped
    }
}

/// Identifies the currently-active ticket interval so ingested keystroke
/// chunks can be bucketed into the right ticket. Set from the frontend
/// whenever the active ticket or timer state changes.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ActiveTicketInterval {
    pub ticket_id: Option<String>,
    /// Unix millis when the current interval started; None when no ticket
    /// is active or the timer is paused.
    pub interval_start_ms: Option<i64>,
}

#[derive(Debug, Default)]
pub struct AppState {
    pub keylog: KeylogConfig,
    pub active: ActiveTicketInterval,
    /// Last read offset into the keylog file (bytes).
    pub keylog_offset: u64,
}
