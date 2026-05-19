//! Effective settings: `defaults <- config.plist <- prefs.plist`.

use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::config_plist;
use crate::prefs_plist;
use crate::settings::{resolve, AppSettings};

static EFFECTIVE: once_cell::sync::Lazy<Arc<RwLock<AppSettings>>> =
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(AppSettings::default())));

/// Reload from disk and return the resolved settings.
pub fn reload_from_disk() -> Result<AppSettings, String> {
    let cfg = config_plist::reload_cache().map_err(|e| e.to_string())?;
    let prefs = prefs_plist::load_partial().map_err(|e| e.to_string())?;
    let resolved = resolve(&[&cfg, &prefs]).map_err(|e| e.to_string())?;
    *EFFECTIVE.write().map_err(|e| e.to_string())? = resolved.clone();
    Ok(resolved)
}

pub fn get() -> AppSettings {
    EFFECTIVE.read().unwrap().clone()
}

#[tauri::command]
pub fn settings_get() -> Result<AppSettings, String> {
    Ok(get())
}

#[tauri::command]
pub fn settings_reload() -> Result<AppSettings, String> {
    reload_from_disk()
}

#[tauri::command]
pub fn prefs_get() -> Result<Value, String> {
    prefs_plist::load_partial().map_err(|e| e.to_string())
}

/// Deep-merge `patch` into prefs.plist and refresh the effective view.
#[tauri::command]
pub fn prefs_patch(patch: Value) -> Result<AppSettings, String> {
    prefs_plist::merge_and_save(&patch).map_err(|e| e.to_string())?;
    reload_from_disk()
}

/// Deep-merge `patch` into config.plist and refresh the effective view.
#[tauri::command]
pub fn config_patch(patch: Value) -> Result<AppSettings, String> {
    config_plist::merge_and_save(&patch).map_err(|e| e.to_string())?;
    reload_from_disk()
}
