# Linear Caryotype

> **Testing branch (`testing/stub-data`).** The frontend API layer in `src/api/`
> is replaced with in-memory fixtures (`src/api/_stubs.ts`): five canned
> tickets, canned LLM responses, in-memory history and keylog. No Linear or
> LLM keys required. Tauri / Rust calls are stubbed out so plain
> `npm run dev` in a browser at `http://localhost:1420` is enough to exercise
> the UI. `npm run tauri:dev` still works for the native window chrome.

An always-on-top macOS panel that turns a Linear backlog into a time-budgeted day,
with an LLM tray for drafting standups and summaries and an LLM-enhanced session
history. The user steers; the app organizes and accommodates.

## Features

- **Three window states** — sliver, compact, expanded — all draggable.
- **Translucent floating panel** that stays above other windows.
- **Linear GraphQL** integration (read today's tickets, optional write with
  approval).
- **Day-budget engine** that allocates the working window across ordered
  tickets and reflows on pause / skip / done / end-of-day.
- **Two-step Done** flow that expands to a "Done screen" with a drafted Linear
  comment and an optional state transition, routed through a Cursor-style
  Approve / Edit / Reject panel.
- **End Day** with confirmation that flags reflowed tickets, drafts
  per-ticket comments, and carries deferred tickets into tomorrow's standup
  blocked section.
- **Pause is one button**: short click = soft pause, long-press = collapse
  pause (collapses the window to a thin pill).
- **LLM tray** (OpenAI or Anthropic): morning standup, ticket summary,
  end-of-day journal, free-form. Copy-only by default; can also queue an
  ad-hoc comment for approval on the current ticket.
- **Keystroke log ingestion** (consumer only). The app does *not* implement
  a keylogger. With the master toggle ON, it tails a user-configured log
  file (e.g. `/var/log/keystroke.log`), partitions chunks by the currently
  active ticket interval, applies redaction regexes, and stores digests in
  SQLite. Chunks are only fed to the LLM when the user explicitly opens the
  tray.
- **Local session history** in SQLite (`history`, `keylog_chunks`,
  `deferred_followups`).
- **API keys** (Linear, OpenAI, Anthropic) live in the OS keychain; calls
  are made from Rust so keys never enter the webview.
- **Global hotkey** to show / hide (default `Cmd+Shift+Space`).

## Toolchain prerequisites

- [Node.js 20+](https://nodejs.org/) (with `npm`).
- [Rust toolchain](https://rustup.rs/) (stable, ≥ 1.77).
- Platform tooling for Tauri 2:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  - **Windows**: Microsoft C++ Build Tools and WebView2 runtime.
  - **Linux**: see [Tauri's prerequisites](https://tauri.app/start/prerequisites/).

## macOS service + `lrctserver` CLI

The running app exposes a Unix socket and loads configuration from native plists:

| File | Purpose |
|------|---------|
| `~/Library/Application Support/Linear Caryotype/config.plist` | Declarative / IT-managed settings |
| `~/Library/Preferences/dev.caryotype.linear.plist` | User prefs (UI + `lrctserver` defaults) |
| `~/Library/Application Support/Linear Caryotype/lrct.sock` | CLI IPC socket |

Install the LaunchAgent (login item):

```bash
chmod +x scripts/install-launchagent.sh scripts/uninstall-launchagent.sh
./scripts/install-launchagent.sh
```

Copy and edit declarative config:

```bash
mkdir -p ~/Library/Application\ Support/Linear\ Caryotype
cp installer/config.plist.example ~/Library/Application\ Support/Linear\ Caryotype/config.plist
```

CLI examples (app must be running):

```bash
cargo build --release --bin lrctserver
./src-tauri/target/release/lrctserver sync tickets now
./src-tauri/target/release/lrctserver sync interval 5m
./src-tauri/target/release/lrctserver linear login --key "$LINEAR_API_KEY"
./src-tauri/target/release/lrctserver workhrs daily 8
./src-tauri/target/release/lrctserver workhrs today 6
./src-tauri/target/release/lrctserver config show
./src-tauri/target/release/lrctserver service status
```

Use `--persist-config` on any write command to store into `config.plist` instead of the prefs plist.

## Run in development

```bash
npm install
npm run tauri:dev
```

Vite serves the React frontend at `http://localhost:1420` and Tauri opens
the floating panel.

## Build

```bash
npm run tauri:build
```

Outputs are in `src-tauri/target/release/bundle/`.

App icons are not committed. Drop a source PNG and run
`npm run tauri icon path/to/source.png` to generate the set into
`src-tauri/icons/`.

## First-run setup

1. Open **Settings** (gear icon in the top-edge bar).
2. Paste your **Linear API key** (Personal API key) and **OpenAI** or
   **Anthropic** key. Keys are stored via the OS keychain (`keyring` crate).
3. Set the **working window** (default 09:00–17:00 with a 12:30–13:00
   lunch).
4. (Optional) Configure the keystroke log path, format, and redaction
   regexes, then flip the **Expect a keystroke logger** toggle on.
5. Click **Load today** in the now-bar (or the timer area) to pull the day's
   tickets.

## Workflow

- **Click the pause button** (top-right) for soft pause; **hold** it for
  ~400ms to collapse the window to a sliver.
- **Click the sliver** to expand again and resume.
- **Scroll wheel** over the ticket stack in expanded mode to cycle tickets;
  **click a card** to jump.
- **Done** is two-step: first press pauses + expands to the Done screen with
  a draft comment + transition; second press (or Next) commits and loads
  the next ticket. Any drafted Linear writes are queued in the **approval
  panel** until you Approve, Edit, or Reject them.
- **End Day** (power icon in top-edge) prompts to confirm, then queues
  per-ticket comments for everything you touched and short "carrying to
  tomorrow" comments for everything that deferred.

## Data locations

- **SQLite database**: `<app data dir>/caryotype.db`
- **Settings store**: `<app data dir>/settings.json`
- **API keys**: OS keychain under service `dev.caryotype.linear`.

## Project layout

```
src/                  # React frontend
  api/                # Thin invoke wrappers around Tauri commands
  components/         # UI: TopEdge, NowBar, TicketStack, DoneScreen, ...
  state/              # Zustand store + budget engine + types
  lib/                # Time helpers
src-tauri/src/        # Rust backend
  app_state.rs        # Managed in-memory state (keylog config + active ticket)
  db.rs               # SQLite (rusqlite) handle + migrations
  history.rs          # history_log / history_query
  keylog.rs           # Tailer + per-ticket attribution
  linear.rs           # GraphQL reads + commentCreate / issueUpdate
  llm.rs              # OpenAI / Anthropic providers
  secrets.rs          # OS keychain wrapper
  window.rs           # Window state + macOS floating-level chrome
```

## Non-goals (v1)

- No Slack integration.
- No silent Linear writes.
- No keylogger implementation; the app only consumes a log produced by an
  external tool you install and configure.
- No team / multi-user features.
- No analytics dashboard.
