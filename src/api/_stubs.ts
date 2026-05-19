/* Test-only stub data. This branch (`testing/stub-data`) replaces the
 * Tauri-backed API layer with in-memory implementations so the UI can be
 * exercised without Linear / LLM credentials and without a running Rust
 * backend. */

import type { LinearIssue, LinearWorkflowState, KeylogConfig } from "../state/types";
import type { HistoryRow, LogInput } from "./history";
import type { KeylogChunk } from "./keylog";
import type { LlmRequest, LlmResponse } from "./llm";

export const STUB_BANNER = "[stub-data] frontend is using in-memory fixtures";

if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.info(STUB_BANNER);
}

export const STUB_ISSUES: LinearIssue[] = [
  {
    id: "stub-1",
    identifier: "CAR-101",
    title: "Wire up always-on-top window chrome on macOS",
    url: "https://linear.app/example/issue/CAR-101",
    priority: 1,
    state_name: "In Progress",
    state_type: "started",
    estimate: 2,
    team_key: "CAR",
    assignee_id: "me",
    labels: ["frontend", "macos"],
  },
  {
    id: "stub-2",
    identifier: "CAR-102",
    title: "Day-budget reflow when a meeting interrupts the schedule",
    url: "https://linear.app/example/issue/CAR-102",
    priority: 2,
    state_name: "Todo",
    state_type: "unstarted",
    estimate: 3,
    team_key: "CAR",
    assignee_id: "me",
    labels: ["planner"],
  },
  {
    id: "stub-3",
    identifier: "CAR-103",
    title: "End-of-day journal: per-ticket comment proposals",
    url: "https://linear.app/example/issue/CAR-103",
    priority: 3,
    state_name: "Todo",
    state_type: "unstarted",
    estimate: 1,
    team_key: "CAR",
    assignee_id: "me",
    labels: ["llm"],
  },
  {
    id: "stub-4",
    identifier: "CAR-104",
    title: "Approval panel: edit + reject UX matches Cursor's tool gating",
    url: "https://linear.app/example/issue/CAR-104",
    priority: 3,
    state_name: "Todo",
    state_type: "unstarted",
    estimate: null,
    team_key: "CAR",
    assignee_id: "me",
    labels: ["ui"],
  },
  {
    id: "stub-5",
    identifier: "CAR-105",
    title: "Keystroke log ingestion: per-ticket attribution + redaction",
    url: "https://linear.app/example/issue/CAR-105",
    priority: 4,
    state_name: "Backlog",
    state_type: "backlog",
    estimate: 2,
    team_key: "CAR",
    assignee_id: "me",
    labels: ["privacy"],
  },
];

export const STUB_WORKFLOW_STATES: LinearWorkflowState[] = [
  { id: "ws-backlog", name: "Backlog", type: "backlog" },
  { id: "ws-todo", name: "Todo", type: "unstarted" },
  { id: "ws-in-progress", name: "In Progress", type: "started" },
  { id: "ws-in-review", name: "In Review", type: "started" },
  { id: "ws-done", name: "Done", type: "completed" },
  { id: "ws-canceled", name: "Canceled", type: "canceled" },
];

/** In-memory history store. */
let nextRowId = 1;
export const HISTORY: HistoryRow[] = [];

export function historyInsert(input: LogInput): number {
  const ts = input.ts_ms ?? Date.now();
  const row: HistoryRow = {
    id: nextRowId++,
    ts_ms: ts,
    ticket_id: input.ticket_id ?? null,
    ticket_identifier: input.ticket_identifier ?? null,
    event: input.event,
    duration_ms: input.duration_ms ?? null,
    note_text: input.note_text ?? null,
  };
  HISTORY.push(row);
  return row.id;
}

/** Pre-seed yesterday's history so the morning standup draft has
 *  something to summarize. */
const yesterdayBase = Date.now() - 24 * 60 * 60 * 1000;
historyInsert({
  event: "start",
  ticket_id: "stub-1",
  ticket_identifier: "CAR-101",
  ts_ms: yesterdayBase,
});
historyInsert({
  event: "done_committed",
  ticket_id: "stub-1",
  ticket_identifier: "CAR-101",
  duration_ms: 95 * 60 * 1000,
  ts_ms: yesterdayBase + 95 * 60 * 1000,
});
historyInsert({
  event: "deferred",
  ticket_id: "stub-3",
  ticket_identifier: "CAR-103",
  note_text: "reflow",
  ts_ms: yesterdayBase + 7 * 60 * 60 * 1000,
});

/** In-memory keylog state. */
export const KEYLOG_CHUNKS: KeylogChunk[] = [
  {
    id: 1,
    ticket_id: "stub-1",
    interval_start_ms: yesterdayBase,
    interval_end_ms: yesterdayBase + 95 * 60 * 1000,
    digest:
      "tauri set_always_on_top NSWindow.level\nfn apply_macos_chrome\nNSFloatingWindowLevel = 3",
  },
];
export let KEYLOG_CONFIG: KeylogConfig = {
  enabled: false,
  path: null,
  format: "timestamped",
  redaction_patterns: [],
  discard_unattributed: true,
};
export function setKeylogConfig(next: KeylogConfig) {
  KEYLOG_CONFIG = next;
}

/** In-memory secrets store (NOT secure — testing only). */
export const SECRETS: Record<string, string | null> = {
  linear: "stub-linear-key",
  openai: "stub-openai-key",
  anthropic: null,
};

/** Canned LLM output keyed by template. */
export function cannedLlm(req: LlmRequest): LlmResponse {
  switch (req.template) {
    case "morning_standup":
      return {
        text:
          "**Done**\n" +
          "- [CAR-101] Wired up always-on-top window chrome on macOS; floating level holds across fullscreen Spaces.\n\n" +
          "**Doing**\n" +
          "- [CAR-102] Day-budget reflow when a meeting interrupts the schedule.\n\n" +
          "**Blocked**\n" +
          "- [CAR-103] Deferred from yesterday by reflow; carrying into today.",
      };
    case "ticket_summary":
      return {
        text:
          "Spent ~95 min on this ticket. Floating window + collection behavior are in. " +
          "Open: verify fullscreen Spaces behavior on the latest macOS build. " +
          "Suggested next step: add a regression note + close.",
      };
    case "done_draft":
      return {
        text:
          "Implemented always-on-top via NSWindow.level = NSFloatingWindowLevel and a " +
          "collection-behavior set that keeps the panel visible across Spaces. " +
          "Validated by toggling between three desktops + one fullscreen app. " +
          "No follow-ups.",
      };
    case "end_of_day_journal":
      return {
        text:
          "## CAR-101 — Always-on-top window chrome\n- Done. Floating level set, behavior verified.\n\n" +
          "## CAR-102 — Day-budget reflow\n- Drafted scaling rule; need to add the per-ticket floor unit test.\n\n" +
          "## CAR-103 — End-of-day journal\n- Deferred (reflow). Carrying to tomorrow.",
      };
    case "deferred_carry_comment":
      return {
        text:
          "Didn't get to this today (deferred by reflow). Most recent context: " +
          "schema sketched, no code yet. Carrying to tomorrow.",
      };
    case "ad_hoc":
      return {
        text:
          "[stub] Ad-hoc response. Your instruction was: " +
          (req.user_prompt ?? "(none)"),
      };
  }
}

/** Resolve after `ms` to simulate IO latency in the UI. */
export function delay<T>(value: T, ms = 80): Promise<T> {
  return new Promise((res) => setTimeout(() => res(value), ms));
}
