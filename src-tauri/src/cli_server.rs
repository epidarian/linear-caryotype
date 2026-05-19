//! Unix-domain socket command server for `lrctserver`.
//!
//! Wire format: newline-delimited JSON.
//! Request:  `{ "cmd": "...", "args": <object>, "persistConfig": <bool> }`
//! Response: `{ "ok": true, "data": <any> } | { "ok": false, "error": "..." }`

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::config_plist;
use crate::paths;
use crate::poller;
use crate::prefs_plist;
use crate::runtime_config;
use crate::secrets::{self, KeyName};

#[derive(Debug, Deserialize)]
pub struct CliRequest {
    pub cmd: String,
    #[serde(default)]
    pub args: Value,
    /// Route writes to config.plist instead of prefs.plist.
    #[serde(default, alias = "persistConfig", alias = "persist_config")]
    pub persist_config: bool,
}

#[derive(Debug, Serialize)]
pub struct CliResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CliResponse {
    fn ok(data: Value) -> Self {
        Self { ok: true, data: Some(data), error: None }
    }
    fn err(msg: impl Into<String>) -> Self {
        Self { ok: false, data: None, error: Some(msg.into()) }
    }
}

pub async fn start(app: AppHandle) {
    if let Err(e) = paths::ensure_app_support() {
        tracing::error!("ensure_app_support: {e}");
        return;
    }
    let sock = paths::socket_path();
    let _ = std::fs::remove_file(&sock);
    let listener = match UnixListener::bind(&sock) {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("bind socket {:?}: {e}", sock);
            return;
        }
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&sock, std::fs::Permissions::from_mode(0o600));
    }
    tracing::info!("lrct CLI listening on {:?}", sock);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = handle_connection(app, stream).await {
                        tracing::warn!("cli connection error: {e}");
                    }
                });
            }
            Err(e) => tracing::warn!("cli accept error: {e}"),
        }
    }
}

async fn handle_connection(app: AppHandle, stream: UnixStream) -> anyhow::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<CliRequest>(&line) {
            Ok(req) => dispatch(&app, req).await,
            Err(e) => CliResponse::err(format!("invalid json: {e}")),
        };
        writer
            .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
            .await?;
    }
    Ok(())
}

async fn dispatch(app: &AppHandle, req: CliRequest) -> CliResponse {
    match req.cmd.as_str() {
        // ---- service ----
        "ping" => CliResponse::ok(json!({ "pong": true })),
        "service.status" => CliResponse::ok(json!({ "running": true })),

        // ---- sync ----
        "sync.tickets_now" => match poller::sync_once(app).await {
            Ok(issues) => CliResponse::ok(json!({ "count": issues.len(), "issues": issues })),
            Err(e) => CliResponse::err(e),
        },

        // ---- Linear auth ----
        "linear.login" => match req.args.get("key").and_then(|v| v.as_str()) {
            Some(k) if !k.is_empty() => match secrets::set_api_key(KeyName::Linear, k.into()) {
                Ok(()) => CliResponse::ok(json!({ "loggedIn": true })),
                Err(e) => CliResponse::err(e),
            },
            _ => CliResponse::err("missing key"),
        },
        "linear.logout" => match secrets::clear_api_key(KeyName::Linear) {
            Ok(()) => CliResponse::ok(json!({ "loggedIn": false })),
            Err(e) => CliResponse::err(e),
        },

        // ---- generic settings patch ----
        "prefs.patch" => apply_patch(req.args, false),
        "config.patch" => apply_patch(req.args, true),

        // ---- inspection ----
        "config.show" => {
            let effective = runtime_config::get();
            let cfg = config_plist::cached();
            let prefs = prefs_plist::load_partial().unwrap_or_else(|_| json!({}));
            CliResponse::ok(json!({
                "effective": effective,
                "configPlist": cfg,
                "prefsPlist": prefs,
                "configPath": config_plist::path_display(),
                "prefsPath": paths::prefs_plist_path().display().to_string(),
                "socketPath": paths::socket_path().display().to_string(),
            }))
        }
        "config.reload" => match runtime_config::reload_from_disk() {
            Ok(s) => CliResponse::ok(json!(s)),
            Err(e) => CliResponse::err(e),
        },

        other => CliResponse::err(format!("unknown command: {other}")),
    }
}

fn apply_patch(patch: Value, to_config: bool) -> CliResponse {
    if !patch.is_object() {
        return CliResponse::err("patch must be a JSON object");
    }
    let result = if to_config {
        config_plist::merge_and_save(&patch).map_err(|e| e.to_string())
    } else {
        prefs_plist::merge_and_save(&patch).map_err(|e| e.to_string())
    };
    if let Err(e) = result {
        return CliResponse::err(e);
    }
    match runtime_config::reload_from_disk() {
        Ok(s) => CliResponse::ok(json!({ "effective": s })),
        Err(e) => CliResponse::err(e),
    }
}
