//! Session history. Frontend logs events via `history_log`; the LLM tray
//! and the today-view read via the query commands.

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum Event {
    Start,
    SoftPause,
    CollapsePause,
    Resume,
    Skip,
    DonePending,
    DoneCommitted,
    Deferred,
    EndDay,
    Note,
}

impl Event {
    fn as_str(&self) -> &'static str {
        match self {
            Event::Start => "start",
            Event::SoftPause => "soft_pause",
            Event::CollapsePause => "collapse_pause",
            Event::Resume => "resume",
            Event::Skip => "skip",
            Event::DonePending => "done_pending",
            Event::DoneCommitted => "done_committed",
            Event::Deferred => "deferred",
            Event::EndDay => "end_day",
            Event::Note => "note",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoryRow {
    pub id: i64,
    pub ts_ms: i64,
    pub ticket_id: Option<String>,
    pub ticket_identifier: Option<String>,
    pub event: String,
    pub duration_ms: Option<i64>,
    pub note_text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LogInput {
    pub event: Event,
    pub ticket_id: Option<String>,
    pub ticket_identifier: Option<String>,
    pub duration_ms: Option<i64>,
    pub note_text: Option<String>,
    /// Optional override; defaults to `now`.
    pub ts_ms: Option<i64>,
}

#[tauri::command]
pub async fn history_log(app: AppHandle, input: LogInput) -> Result<i64, String> {
    let db = db::db(&app).await.map_err(|e| e.to_string())?;
    let conn = db.lock().await;
    let ts = input.ts_ms.unwrap_or_else(|| Utc::now().timestamp_millis());
    conn.execute(
        "INSERT INTO history (ts_ms, ticket_id, ticket_identifier, event, duration_ms, note_text) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            ts,
            input.ticket_id,
            input.ticket_identifier,
            input.event.as_str(),
            input.duration_ms,
            input.note_text,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[derive(Debug, Default, Deserialize)]
pub struct QueryFilters {
    pub since_ms: Option<i64>,
    pub until_ms: Option<i64>,
    pub ticket_id: Option<String>,
    pub events: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[tauri::command]
pub async fn history_query(
    app: AppHandle,
    filters: QueryFilters,
) -> Result<Vec<HistoryRow>, String> {
    let db = db::db(&app).await.map_err(|e| e.to_string())?;
    let conn = db.lock().await;

    let mut sql = String::from(
        "SELECT id, ts_ms, ticket_id, ticket_identifier, event, duration_ms, note_text \
         FROM history WHERE 1=1",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(s) = filters.since_ms {
        sql.push_str(" AND ts_ms >= ?");
        args.push(Box::new(s));
    }
    if let Some(u) = filters.until_ms {
        sql.push_str(" AND ts_ms <= ?");
        args.push(Box::new(u));
    }
    if let Some(t) = filters.ticket_id {
        sql.push_str(" AND ticket_id = ?");
        args.push(Box::new(t));
    }
    if let Some(evs) = filters.events.filter(|v| !v.is_empty()) {
        let placeholders = evs.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        sql.push_str(&format!(" AND event IN ({placeholders})"));
        for e in evs {
            args.push(Box::new(e));
        }
    }
    sql.push_str(" ORDER BY ts_ms ASC");
    if let Some(l) = filters.limit {
        sql.push_str(" LIMIT ?");
        args.push(Box::new(l));
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    let rows = stmt
        .query_map(refs.as_slice(), |r| {
            Ok(HistoryRow {
                id: r.get(0)?,
                ts_ms: r.get(1)?,
                ticket_id: r.get(2)?,
                ticket_identifier: r.get(3)?,
                event: r.get(4)?,
                duration_ms: r.get(5)?,
                note_text: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Convenience: today's events (local day boundary computed by caller and
/// passed in as `since_ms` if precise; otherwise we use UTC midnight).
#[tauri::command]
pub async fn history_today(app: AppHandle) -> Result<Vec<HistoryRow>, String> {
    let now = Utc::now();
    let start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .map(|n| n.and_utc().timestamp_millis())
        .unwrap_or(0);
    history_query(
        app,
        QueryFilters {
            since_ms: Some(start),
            ..Default::default()
        },
    )
    .await
}

#[tauri::command]
pub async fn history_recent_for_ticket(
    app: AppHandle,
    ticket_id: String,
    limit: Option<i64>,
) -> Result<Vec<HistoryRow>, String> {
    history_query(
        app,
        QueryFilters {
            ticket_id: Some(ticket_id),
            limit: limit.or(Some(200)),
            ..Default::default()
        },
    )
    .await
}
