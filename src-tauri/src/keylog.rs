//! Keystroke log ingestion (consumer only). Tails a user-configured file,
//! applies redaction filters, buckets digests into the currently-active
//! ticket interval, and stores them in SQLite. Never sends data to the LLM
//! on its own; the frontend explicitly requests chunks via
//! `keylog_chunks_for_ticket`.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::sync::Mutex;

use crate::app_state::{ActiveTicketInterval, AppState, KeylogConfig, KeylogFormat};
use crate::db;

const POLL_INTERVAL_SECS: u64 = 30;
const MAX_CHUNK_BYTES: usize = 2048;

#[derive(Debug, Serialize, Deserialize)]
pub struct KeylogChunk {
    pub id: i64,
    pub ticket_id: Option<String>,
    pub interval_start_ms: i64,
    pub interval_end_ms: i64,
    pub digest: String,
}

#[tauri::command]
pub async fn keylog_set_config(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    config: KeylogConfig,
) -> Result<(), String> {
    let mut s = state.lock().await;
    let path_changed = s.keylog.path != config.path;
    s.keylog = config;
    if path_changed {
        s.keylog_offset = 0;
    }
    Ok(())
}

#[tauri::command]
pub async fn keylog_get_config(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<KeylogConfig, String> {
    Ok(state.lock().await.keylog.clone())
}

#[tauri::command]
pub async fn keylog_set_active_ticket(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    ticket_id: Option<String>,
    interval_start_ms: Option<i64>,
) -> Result<(), String> {
    let mut s = state.lock().await;
    s.active = ActiveTicketInterval {
        ticket_id,
        interval_start_ms,
    };
    Ok(())
}

#[tauri::command]
pub async fn keylog_purge(app: AppHandle) -> Result<(), String> {
    let db = db::db(&app).await.map_err(|e| e.to_string())?;
    let conn = db.lock().await;
    conn.execute("DELETE FROM keylog_chunks", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn keylog_chunks_for_ticket(
    app: AppHandle,
    ticket_id: String,
    since_ms: Option<i64>,
) -> Result<Vec<KeylogChunk>, String> {
    let db = db::db(&app).await.map_err(|e| e.to_string())?;
    let conn = db.lock().await;
    let mut sql = String::from(
        "SELECT id, ticket_id, interval_start_ms, interval_end_ms, digest \
         FROM keylog_chunks WHERE ticket_id = ?1",
    );
    if since_ms.is_some() {
        sql.push_str(" AND interval_end_ms >= ?2");
    }
    sql.push_str(" ORDER BY interval_start_ms ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mapper = |r: &rusqlite::Row| {
        Ok(KeylogChunk {
            id: r.get(0)?,
            ticket_id: r.get(1)?,
            interval_start_ms: r.get(2)?,
            interval_end_ms: r.get(3)?,
            digest: r.get(4)?,
        })
    };
    let rows = if let Some(ts) = since_ms {
        stmt.query_map(params![ticket_id, ts], mapper)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map(params![ticket_id], mapper)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    Ok(rows)
}

pub async fn spawn_tailer(app: AppHandle, state: Arc<Mutex<AppState>>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
            if let Err(e) = tick(&app, &state).await {
                tracing::warn!("keylog tail tick failed: {e:?}");
            }
        }
    });
}

async fn tick(app: &AppHandle, state: &Arc<Mutex<AppState>>) -> Result<()> {
    let snapshot = {
        let s = state.lock().await;
        s.snapshot()
    };
    if !snapshot.enabled {
        return Ok(());
    }
    let Some(path) = snapshot.path.clone() else {
        return Ok(());
    };
    let path = PathBuf::from(path);
    if !path.exists() {
        return Ok(());
    }

    let bytes = tokio::fs::metadata(&path).await?.len();
    let start = snapshot.offset.min(bytes);
    if bytes <= start {
        return Ok(());
    }

    let mut file = tokio::fs::File::open(&path).await?;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let mut buf = Vec::with_capacity((bytes - start) as usize);
    file.read_to_end(&mut buf).await?;
    let raw = String::from_utf8_lossy(&buf).to_string();

    let lines = parse(&raw, snapshot.format);
    let cleaned = redact(&lines, &snapshot.redaction_patterns);
    if cleaned.is_empty() {
        let mut s = state.lock().await;
        s.keylog_offset = bytes;
        return Ok(());
    }
    let digest = digest(&cleaned);

    let (ticket_id, interval_start_ms, discard_unattributed) = {
        let s = state.lock().await;
        (
            s.active.ticket_id.clone(),
            s.active.interval_start_ms,
            s.keylog.discard_unattributed,
        )
    };
    let now = Utc::now().timestamp_millis();
    if ticket_id.is_none() && discard_unattributed {
        let mut s = state.lock().await;
        s.keylog_offset = bytes;
        return Ok(());
    }

    let db = db::db(app).await?;
    {
        let conn = db.lock().await;
        conn.execute(
            "INSERT INTO keylog_chunks (ticket_id, interval_start_ms, interval_end_ms, digest) \
             VALUES (?1, ?2, ?3, ?4)",
            params![ticket_id, interval_start_ms.unwrap_or(now), now, digest],
        )?;
    }

    let mut s = state.lock().await;
    s.keylog_offset = bytes;
    Ok(())
}

#[derive(Debug, Clone)]
struct TailSnapshot {
    enabled: bool,
    path: Option<String>,
    format: KeylogFormat,
    redaction_patterns: Vec<String>,
    offset: u64,
}

impl AppState {
    fn snapshot(&self) -> TailSnapshot {
        TailSnapshot {
            enabled: self.keylog.enabled,
            path: self.keylog.path.clone(),
            format: self.keylog.format,
            redaction_patterns: self.keylog.redaction_patterns.clone(),
            offset: self.keylog_offset,
        }
    }
}

fn parse(raw: &str, fmt: KeylogFormat) -> Vec<String> {
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| match fmt {
            KeylogFormat::Plain => line.to_string(),
            KeylogFormat::Timestamped => line
                .splitn(2, char::is_whitespace)
                .nth(1)
                .unwrap_or(line)
                .to_string(),
            KeylogFormat::Jsonl => serde_json::from_str::<serde_json::Value>(line)
                .ok()
                .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                .unwrap_or_default(),
        })
        .filter(|s| !s.is_empty())
        .collect()
}

fn redact(lines: &[String], patterns: &[String]) -> Vec<String> {
    let regexes: Vec<Regex> = patterns
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect();
    lines
        .iter()
        .filter(|l| !regexes.iter().any(|r| r.is_match(l)))
        .cloned()
        .collect()
}

fn digest(lines: &[String]) -> String {
    let mut deduped: Vec<&String> = Vec::with_capacity(lines.len());
    for l in lines {
        if deduped.last().map(|s| s.as_str()) != Some(l.as_str()) {
            deduped.push(l);
        }
    }
    let joined = deduped
        .iter()
        .map(|s| s.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    if joined.len() <= MAX_CHUNK_BYTES {
        joined
    } else {
        joined[joined.len() - MAX_CHUNK_BYTES..].to_string()
    }
}
