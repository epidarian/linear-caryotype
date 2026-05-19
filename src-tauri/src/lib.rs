mod app_state;
mod db;
mod history;
mod keylog;
mod linear;
mod llm;
mod secrets;
mod window;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use app_state::AppState;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let state = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state_clone = state.clone();

            // Apply macOS vibrancy / floating window level on startup.
            if let Some(window) = app.get_webview_window("main") {
                window::apply_macos_chrome(&window);
            }

            // Initialize SQLite schema.
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_schema(&app_handle).await {
                    tracing::error!("schema init failed: {e:?}");
                }
                // Start the keylog tailer (will no-op until enabled).
                keylog::spawn_tailer(app_handle.clone(), state_clone).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window
            window::set_window_state,
            window::set_opacity,
            window::edge_snap,
            window::start_dragging,
            // Secrets
            secrets::set_api_key,
            secrets::get_api_key,
            secrets::clear_api_key,
            // Linear
            linear::linear_fetch_today,
            linear::linear_fetch_issue,
            linear::linear_post_comment,
            linear::linear_update_state,
            linear::linear_workflow_states,
            // LLM
            llm::llm_generate,
            // Keylog
            keylog::keylog_set_config,
            keylog::keylog_get_config,
            keylog::keylog_purge,
            keylog::keylog_chunks_for_ticket,
            keylog::keylog_set_active_ticket,
            // History
            history::history_log,
            history::history_query,
            history::history_today,
            history::history_recent_for_ticket,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
