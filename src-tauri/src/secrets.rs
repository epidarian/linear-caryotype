//! OS keychain wrapper. Keeps API keys (Linear, OpenAI/Anthropic) out of the
//! frontend so they never reach the webview.

use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "dev.caryotype.linear";

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KeyName {
    Linear,
    Openai,
    Anthropic,
}

impl KeyName {
    fn account(self) -> &'static str {
        match self {
            KeyName::Linear => "linear-api-key",
            KeyName::Openai => "openai-api-key",
            KeyName::Anthropic => "anthropic-api-key",
        }
    }
}

#[tauri::command]
pub fn set_api_key(name: KeyName, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE, name.account()).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(name: KeyName) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, name.account()).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_api_key(name: KeyName) -> Result<(), String> {
    let entry = Entry::new(SERVICE, name.account()).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Convenience for internal callers (linear/llm modules).
pub fn read(name: KeyName) -> Result<Option<String>, String> {
    get_api_key(name)
}
