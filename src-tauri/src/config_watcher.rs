//! Optional live reload when `config.plist` changes (macOS / dev).

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::paths;
use crate::runtime_config;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(e) = watch_loop(app) {
            tracing::warn!("config watcher stopped: {e}");
        }
    });
}

fn watch_loop(app: AppHandle) -> anyhow::Result<()> {
    let path = paths::config_plist_path();
    let parent = path
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(paths::app_support_dir);
    let (tx, rx) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )?;
    watcher.watch(&parent, RecursiveMode::NonRecursive)?;

    loop {
        match rx.recv() {
            Ok(Ok(event)) => {
                if event.paths.iter().any(|p| p == &path) {
                    if let Err(e) = runtime_config::reload_from_disk() {
                        tracing::warn!("config reload failed: {e}");
                    } else {
                        let _ = app.emit("config-reloaded", runtime_config::get());
                    }
                }
            }
            Ok(Err(e)) => tracing::warn!("config watcher event error: {e}"),
            Err(_) => break,
        }
    }
    Ok(())
}
