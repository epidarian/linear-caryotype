//! macOS-first filesystem locations for config, prefs, socket, and logs.

use std::path::PathBuf;

pub const BUNDLE_ID: &str = "dev.caryotype.linear";
pub const APP_NAME: &str = "Linear Caryotype";

/// `~/Library/Application Support/Linear Caryotype/`
pub fn app_support_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(APP_NAME);
        }
    }
    dirs_fallback().join(APP_NAME)
}

pub fn config_plist_path() -> PathBuf {
    app_support_dir().join("config.plist")
}

pub fn socket_path() -> PathBuf {
    app_support_dir().join("lrct.sock")
}

/// `~/Library/Preferences/dev.caryotype.linear.plist`
pub fn prefs_plist_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Preferences")
                .join(format!("{BUNDLE_ID}.plist"));
        }
    }
    app_support_dir().join("prefs.plist")
}

pub fn logs_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Logs")
                .join(APP_NAME);
        }
    }
    app_support_dir().join("logs")
}

fn dirs_fallback() -> PathBuf {
    std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn ensure_app_support() -> std::io::Result<()> {
    std::fs::create_dir_all(app_support_dir())
}
