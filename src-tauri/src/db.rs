//! SQLite layer using `rusqlite`. A single shared connection lives behind
//! a Mutex; throughput is fine for our workload (interactive UI events
//! and a 30s keylog tick).

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

pub type Db = Arc<Mutex<Connection>>;

static DB: OnceLock<Db> = OnceLock::new();

/// Return the shared database handle, opening + migrating on first call.
pub async fn db(app: &AppHandle) -> Result<Db> {
    if let Some(d) = DB.get() {
        return Ok(d.clone());
    }
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }
    let conn = Connection::open(&path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    let arc = Arc::new(Mutex::new(conn));
    let _ = DB.set(arc.clone());
    Ok(arc)
}

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("app_data_dir error: {e}"))?;
    Ok(dir.join("caryotype.db"))
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts_ms INTEGER NOT NULL,
            ticket_id TEXT,
            ticket_identifier TEXT,
            event TEXT NOT NULL,
            duration_ms INTEGER,
            note_text TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_history_ts ON history(ts_ms);
        CREATE INDEX IF NOT EXISTS idx_history_ticket ON history(ticket_id);

        CREATE TABLE IF NOT EXISTS keylog_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT,
            interval_start_ms INTEGER NOT NULL,
            interval_end_ms INTEGER NOT NULL,
            digest TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_keylog_ticket ON keylog_chunks(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_keylog_interval
            ON keylog_chunks(interval_start_ms, interval_end_ms);

        CREATE TABLE IF NOT EXISTS deferred_followups (
            ticket_id TEXT PRIMARY KEY,
            ticket_identifier TEXT,
            reason TEXT NOT NULL,
            ts_ms INTEGER NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )?;
    Ok(())
}

/// Eagerly initialise the schema during setup so failures surface early.
pub async fn init_schema(app: &AppHandle) -> Result<()> {
    let _ = db(app).await?;
    Ok(())
}
