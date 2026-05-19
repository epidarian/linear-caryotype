//! `lrctserver` — CLI client for the running Linear Caryotype service.
//!
//! Human-friendly subcommands compile down to a small wire vocabulary
//! (`sync.*`, `linear.*`, `prefs.patch`, `config.patch`, `config.*`).

use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use serde_json::{json, Value};

const HOUR_MS: i64 = 60 * 60 * 1000;

#[derive(Parser)]
#[command(name = "lrctserver", about = "Linear Caryotype service CLI")]
struct Cli {
    /// Persist writes to config.plist instead of prefs.plist.
    #[arg(long, global = true)]
    persist_config: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Linear sync
    Sync {
        #[command(subcommand)]
        cmd: SyncCmd,
    },
    /// Linear credentials
    Linear {
        #[command(subcommand)]
        cmd: LinearCmd,
    },
    /// Working hours (daily budget + today override)
    Workhrs {
        #[command(subcommand)]
        cmd: WorkhrsCmd,
    },
    /// Default Linear label filter
    Label {
        #[command(subcommand)]
        cmd: LabelCmd,
    },
    /// LLM provider / model
    Llm {
        #[command(subcommand)]
        cmd: LlmCmd,
    },
    /// Configuration
    Config {
        #[command(subcommand)]
        cmd: ConfigCmd,
    },
    /// Service control
    Service {
        #[command(subcommand)]
        cmd: ServiceCmd,
    },
}

#[derive(Subcommand)]
enum SyncCmd {
    /// Pull tickets now.
    Tickets {
        #[command(subcommand)]
        action: TicketsAction,
    },
    /// Polling interval: 30s, 5m, 1h, or "off".
    Interval { value: String },
}

#[derive(Subcommand)]
enum TicketsAction {
    Now,
}

#[derive(Subcommand)]
enum LinearCmd {
    /// Store the Linear personal API key.
    Login {
        #[arg(long)]
        key: Option<String>,
    },
    Logout,
}

#[derive(Subcommand)]
enum WorkhrsCmd {
    /// Set the recurring daily budget in hours.
    Daily { hours: f64 },
    /// Override today's budget in hours. Pass 0 to clear.
    Today { hours: f64 },
}

#[derive(Subcommand)]
enum LabelCmd {
    Set { name: String },
    Clear,
}

#[derive(Subcommand)]
enum LlmCmd {
    Provider { name: String },
    Model { id: String },
}

#[derive(Subcommand)]
enum ConfigCmd {
    Show,
    Reload,
    Edit,
}

#[derive(Subcommand)]
enum ServiceCmd {
    Status,
    Open,
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let persist = cli.persist_config;

    let (cmd, args) = match cli.command {
        Commands::Sync { cmd } => match cmd {
            SyncCmd::Tickets { action: TicketsAction::Now } => {
                ("sync.tickets_now".into(), json!({}))
            }
            SyncCmd::Interval { value } => {
                let secs = parse_interval(&value)?;
                patch_cmd(persist, json!({ "linearPollIntervalSeconds": secs }))
            }
        },
        Commands::Linear { cmd } => match cmd {
            LinearCmd::Login { key } => {
                let k = key.map(Ok::<_, anyhow::Error>).unwrap_or_else(read_stdin_key)?;
                ("linear.login".into(), json!({ "key": k }))
            }
            LinearCmd::Logout => ("linear.logout".into(), json!({})),
        },
        Commands::Workhrs { cmd } => match cmd {
            WorkhrsCmd::Daily { hours } => {
                patch_cmd(persist, json!({ "dailyHoursMaxMs": hours_to_ms(hours) }))
            }
            WorkhrsCmd::Today { hours } => {
                let v: Value = if hours <= 0.0 {
                    Value::Null
                } else {
                    json!(hours_to_ms(hours))
                };
                patch_cmd(persist, json!({ "todayHoursOverrideMs": v }))
            }
        },
        Commands::Label { cmd } => match cmd {
            LabelCmd::Set { name } => patch_cmd(persist, json!({ "defaultLabel": name })),
            LabelCmd::Clear => patch_cmd(persist, json!({ "defaultLabel": Value::Null })),
        },
        Commands::Llm { cmd } => match cmd {
            LlmCmd::Provider { name } => {
                if name != "openai" && name != "anthropic" {
                    anyhow::bail!("provider must be openai or anthropic");
                }
                patch_cmd(persist, json!({ "llmProvider": name }))
            }
            LlmCmd::Model { id } => patch_cmd(persist, json!({ "llmModel": id })),
        },
        Commands::Config { cmd } => match cmd {
            ConfigCmd::Show => ("config.show".into(), json!({})),
            ConfigCmd::Reload => ("config.reload".into(), json!({})),
            ConfigCmd::Edit => {
                edit_config_plist()?;
                return Ok(());
            }
        },
        Commands::Service { cmd } => match cmd {
            ServiceCmd::Status => {
                if ping()? {
                    println!("service: running");
                    return Ok(());
                } else {
                    println!("service: not running");
                    std::process::exit(2);
                }
            }
            ServiceCmd::Open => {
                open_app()?;
                return Ok(());
            }
        },
    };

    let resp = send_command(&cmd, args, persist)?;
    print_response(&resp)?;
    if !resp.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        std::process::exit(1);
    }
    Ok(())
}

fn patch_cmd(persist: bool, patch: Value) -> (String, Value) {
    if persist {
        ("config.patch".into(), patch)
    } else {
        ("prefs.patch".into(), patch)
    }
}

fn hours_to_ms(h: f64) -> i64 {
    (h * HOUR_MS as f64).round() as i64
}

fn parse_interval(s: &str) -> anyhow::Result<u64> {
    let s = s.trim().to_lowercase();
    if s == "off" {
        return Ok(0);
    }
    let (num_str, mult): (&str, u64) = if let Some(rest) = s.strip_suffix('s') {
        (rest, 1)
    } else if let Some(rest) = s.strip_suffix('m') {
        (rest, 60)
    } else if let Some(rest) = s.strip_suffix('h') {
        (rest, 3600)
    } else {
        (s.as_str(), 1)
    };
    let n: u64 = num_str.parse().map_err(|_| anyhow::anyhow!("use 30s, 5m, 1h, or off"))?;
    Ok(n * mult)
}

fn read_stdin_key() -> anyhow::Result<String> {
    eprint!("Linear API key: ");
    io::stderr().flush()?;
    let mut line = String::new();
    io::stdin().read_line(&mut line)?;
    Ok(line.trim().to_string())
}

fn socket_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Linear Caryotype")
                .join("lrct.sock");
        }
    }
    PathBuf::from(".").join("lrct.sock")
}

fn send_command(cmd: &str, args: Value, persist_config: bool) -> anyhow::Result<Value> {
    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;
        use std::time::Duration;

        let path = socket_path();
        let mut stream = UnixStream::connect(&path)
            .map_err(|e| anyhow::anyhow!("connect {:?}: {e} (is the service running?)", path))?;
        stream.set_read_timeout(Some(Duration::from_secs(30)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        let req = json!({ "cmd": cmd, "args": args, "persistConfig": persist_config });
        let mut payload = serde_json::to_string(&req)?;
        payload.push('\n');
        std::io::Write::write_all(&mut stream, payload.as_bytes())?;
        let mut reader = std::io::BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let resp: Value = serde_json::from_str(line.trim())?;
        return Ok(resp);
    }
    #[cfg(not(unix))]
    {
        let _ = (cmd, args, persist_config);
        anyhow::bail!("lrctserver requires a Unix domain socket (macOS/Linux)");
    }
}

fn ping() -> anyhow::Result<bool> {
    match send_command("ping", json!({}), false) {
        Ok(v) => Ok(v.get("ok").and_then(|b| b.as_bool()).unwrap_or(false)),
        Err(_) => Ok(false),
    }
}

fn print_response(resp: &Value) -> anyhow::Result<()> {
    if let Some(data) = resp.get("data") {
        println!("{}", serde_json::to_string_pretty(data)?);
    } else if let Some(err) = resp.get("error").and_then(|v| v.as_str()) {
        eprintln!("{err}");
    }
    Ok(())
}

fn edit_config_plist() -> anyhow::Result<()> {
    let path = socket_path();
    let parent = path.parent().unwrap();
    std::fs::create_dir_all(parent)?;
    let config_path = parent.join("config.plist");
    if !config_path.exists() {
        std::fs::write(
            &config_path,
            include_str!("../../../installer/config.plist.example"),
        )?;
    }
    let editor = std::env::var("EDITOR").unwrap_or_else(|_| "nano".into());
    let status = std::process::Command::new(&editor)
        .arg(&config_path)
        .status()?;
    if !status.success() {
        anyhow::bail!("editor exited with {status}");
    }
    let _ = send_command("config.reload", json!({}), false)?;
    println!("reloaded config from {:?}", config_path);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_app() -> anyhow::Result<()> {
    let status = std::process::Command::new("open")
        .arg("-a")
        .arg("Linear Caryotype")
        .status()?;
    if !status.success() {
        anyhow::bail!("open failed: {status}");
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn open_app() -> anyhow::Result<()> {
    anyhow::bail!("service open is only supported on macOS")
}
