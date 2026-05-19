//! Declarative `config.plist` under Application Support.
//!
//! Stores a `Partial<AppSettings>` JSON object. Intended for managed
//! deployment (e.g. shipped by IT or via MDM). Same shape as prefs.plist.

use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;
use std::sync::{Arc, RwLock};

use crate::paths;
use crate::settings::{deep_merge, empty_partial};

static CACHE: once_cell::sync::Lazy<Arc<RwLock<Value>>> =
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(empty_partial())));

pub fn load_partial() -> Result<Value> {
    let path = paths::config_plist_path();
    if !path.exists() {
        return Ok(empty_partial());
    }
    let data = fs::read(&path).with_context(|| format!("read {:?}", path))?;
    let v: Value = plist::from_bytes(&data)?;
    Ok(if v.is_object() { v } else { empty_partial() })
}

pub fn save_partial(partial: &Value) -> Result<()> {
    paths::ensure_app_support()?;
    let path = paths::config_plist_path();
    let xml = plist::to_xml(partial)?;
    fs::write(&path, xml)?;
    *CACHE.write().unwrap() = partial.clone();
    Ok(())
}

pub fn reload_cache() -> Result<Value> {
    let v = load_partial()?;
    *CACHE.write().unwrap() = v.clone();
    Ok(v)
}

pub fn cached() -> Value {
    CACHE.read().unwrap().clone()
}

pub fn merge_and_save(patch: &Value) -> Result<Value> {
    let mut current = load_partial()?;
    deep_merge(&mut current, patch);
    save_partial(&current)?;
    Ok(current)
}

pub fn path_display() -> String {
    paths::config_plist_path().display().to_string()
}

#[tauri::command]
pub fn config_get() -> Result<Value, String> {
    reload_cache().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_reload() -> Result<Value, String> {
    reload_cache().map_err(|e| e.to_string())
}
