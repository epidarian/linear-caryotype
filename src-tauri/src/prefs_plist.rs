//! User preferences at `~/Library/Preferences/dev.caryotype.linear.plist`.
//!
//! Stores a `Partial<AppSettings>` JSON object. Only fields the user has
//! actually changed appear in the file.

use anyhow::{Context, Result};
use serde_json::Value;
use std::fs;

use crate::paths;
use crate::settings::{deep_merge, empty_partial};

pub fn load_partial() -> Result<Value> {
    let path = paths::prefs_plist_path();
    if !path.exists() {
        return Ok(empty_partial());
    }
    let data = fs::read(&path).with_context(|| format!("read {:?}", path))?;
    let v: Value = plist::from_bytes(&data)?;
    Ok(if v.is_object() { v } else { empty_partial() })
}

pub fn save_partial(partial: &Value) -> Result<()> {
    paths::ensure_app_support()?;
    let path = paths::prefs_plist_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let xml = plist::to_xml(partial)?;
    fs::write(&path, xml)?;
    Ok(())
}

/// Deep-merge `patch` into the persisted prefs and write.
pub fn merge_and_save(patch: &Value) -> Result<Value> {
    let mut current = load_partial()?;
    deep_merge(&mut current, patch);
    save_partial(&current)?;
    Ok(current)
}
