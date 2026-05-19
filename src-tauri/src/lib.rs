mod app_state;
mod cli_server;
mod config_plist;
mod config_watcher;
mod db;
mod history;
mod keylog;
mod linear;
mod llm;
mod paths;
mod poller;
mod prefs_plist;
mod runtime_config;
mod secrets;
mod settings;
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(state.clone())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state_clone = state.clone();

            if let Some(window) = app.get_webview_window("main") {
                window::apply_macos_chrome(&window);
            }

            if let Err(e) = runtime_config::reload_from_disk() {
                tracing::error!("settings reload failed: {e}");
            }

            let app_poll = app_handle.clone();
            let app_cli = app_handle.clone();
            let app_watch = app_handle.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_schema(&app_handle).await {
                    tracing::error!("schema init failed: {e:?}");
                }
                keylog::spawn_tailer(app_handle.clone(), state_clone).await;
                poller::spawn_poller(app_poll).await;

                if runtime_config::get().auto_sync_on_start {
                    if let Err(e) = poller::sync_once(&app_handle).await {
                        tracing::warn!("auto sync on start: {e}");
                    }
                }
            });

            #[cfg(unix)]
            tauri::async_runtime::spawn(async move {
                cli_server::start(app_cli).await;
            });

            config_watcher::spawn(app_watch);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::set_window_state,
            window::set_opacity,
            window::edge_snap,
            window::start_dragging,
            secrets::set_api_key,
            secrets::get_api_key,
            secrets::clear_api_key,
            linear::linear_fetch_today,
            linear::linear_fetch_issue,
            linear::linear_post_comment,
            linear::linear_update_state,
            linear::linear_workflow_states,
            poller::linear_sync_now,
            llm::llm_generate,
            keylog::keylog_set_config,
            keylog::keylog_get_config,
            keylog::keylog_purge,
            keylog::keylog_chunks_for_ticket,
            keylog::keylog_set_active_ticket,
            history::history_log,
            history::history_query,
            history::history_today,
            history::history_recent_for_ticket,
            runtime_config::settings_get,
            runtime_config::settings_reload,
            runtime_config::prefs_get,
            runtime_config::prefs_patch,
            runtime_config::config_patch,
            config_plist::config_get,
            config_plist::config_reload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
