//! Background Linear ticket poller; emits `tickets-updated` to the webview.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::time;

use crate::linear;
use crate::runtime_config;

static POLLING: AtomicBool = AtomicBool::new(false);

pub async fn spawn_poller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let secs = runtime_config::get().linear_poll_interval_seconds;
            if secs == 0 {
                time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            time::sleep(Duration::from_secs(secs)).await;
            if let Err(e) = sync_once(&app).await {
                tracing::warn!("poller tick failed: {e}");
            }
        }
    });
}

pub async fn sync_once(app: &AppHandle) -> Result<Vec<linear::LinearIssue>, String> {
    if POLLING.swap(true, Ordering::SeqCst) {
        return Err("sync already in progress".into());
    }
    let result = async {
        let label = runtime_config::get().default_label.clone();
        let issues = linear::linear_fetch_today(label).await?;
        let _ = app.emit("tickets-updated", &issues);
        Ok(issues)
    }
    .await;
    POLLING.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub async fn linear_sync_now(app: AppHandle) -> Result<Vec<linear::LinearIssue>, String> {
    sync_once(&app).await
}
