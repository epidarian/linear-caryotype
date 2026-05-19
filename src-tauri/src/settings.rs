//! Single source of truth for application settings.
//!
//! - One struct: [`AppSettings`].
//! - Both `prefs.plist` and `config.plist` store a *partial* of this shape;
//!   they are deep-merged into a default `AppSettings` to produce the
//!   effective settings.
//! - All durations are stored as milliseconds. UI / CLI convert at the
//!   human boundary (hours, minutes).

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Total working time per day, in ms.
    pub daily_hours_max_ms: i64,
    /// Override the daily budget for today only (ms).
    pub today_hours_override_ms: Option<i64>,
    /// Minimum allocation per ticket (ms). Tickets that would fall below
    /// this floor during reflow are deferred.
    pub per_ticket_min_ms: i64,
    /// Maximum allocation per ticket (ms). Caps overlarge estimates.
    pub per_ticket_max_ms: Option<i64>,

    pub opacity: f64,
    pub llm_provider: String,
    pub llm_model: String,
    pub default_label: Option<String>,
    pub long_press_ms: i64,
    pub hotkey: Option<String>,
    /// Poll Linear every N seconds. 0 = off.
    pub linear_poll_interval_seconds: u64,
    /// Auto-pull tickets when the service starts.
    pub auto_sync_on_start: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            daily_hours_max_ms: 8 * 60 * 60 * 1000,
            today_hours_override_ms: None,
            per_ticket_min_ms: 10 * 60 * 1000,
            per_ticket_max_ms: None,
            opacity: 0.9,
            llm_provider: "openai".into(),
            llm_model: "gpt-4o-mini".into(),
            default_label: None,
            long_press_ms: 400,
            hotkey: Some("CommandOrControl+Shift+Space".into()),
            linear_poll_interval_seconds: 300,
            auto_sync_on_start: true,
        }
    }
}

/// Deep-merge `overlay` into `base` in place. Object keys are merged
/// recursively; other JSON types replace.
pub fn deep_merge(base: &mut Value, overlay: &Value) {
    match (base, overlay) {
        (Value::Object(b), Value::Object(o)) => {
            for (k, v) in o {
                match b.get_mut(k) {
                    Some(existing) => deep_merge(existing, v),
                    None => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (slot, v) => {
            *slot = v.clone();
        }
    }
}

/// Combine defaults + overlays into an `AppSettings`. Unknown keys in
/// overlays are ignored by serde.
pub fn resolve(overlays: &[&Value]) -> Result<AppSettings, serde_json::Error> {
    let mut acc = serde_json::to_value(AppSettings::default())?;
    for o in overlays {
        deep_merge(&mut acc, o);
    }
    serde_json::from_value(acc)
}

/// Pretty alias for "a JSON object representing Partial<AppSettings>".
pub type SettingsPartial = Map<String, Value>;

pub fn empty_partial() -> Value {
    Value::Object(SettingsPartial::new())
}
