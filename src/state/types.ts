export type WindowState = "sliver" | "compact" | "expanded";

export type TimerStatus =
  | "idle"
  | "running"
  | "soft_paused"
  | "collapse_paused"
  | "done_pending"
  | "ended";

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  state_name: string;
  state_type: string;
  estimate: number | null;
  team_key: string | null;
  assignee_id: string | null;
  labels: string[];
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
}

export interface TicketBudget {
  issue: LinearIssue;
  /** Allocated ms for today. */
  budgetMs: number;
  /** Remaining ms (decreases while active). */
  remainingMs: number;
  /** Cumulative time spent today. */
  spentMs: number;
  /** Set after reflow drops this ticket from the day. */
  deferred: boolean;
  /** True after first press of Done; cleared on commit or cancel. */
  donePending: boolean;
  /** True after commit. */
  doneCommitted: boolean;
  /** True if user skipped to back of stack today. */
  skippedToBack: boolean;
}

export interface ApprovalProposal {
  id: string;
  kind: "comment" | "transition";
  ticketId: string;
  ticketIdentifier: string;
  /** For comments. */
  body?: string;
  /** For transitions. */
  stateId?: string;
  stateName?: string;
  /** Origin trigger. */
  source: "done" | "end_day_touched" | "end_day_deferred" | "ad_hoc";
}

export interface KeylogConfig {
  enabled: boolean;
  path: string | null;
  format: "plain" | "jsonl" | "timestamped";
  redaction_patterns: string[];
  discard_unattributed: boolean;
}

/** Mirror of Rust `AppSettings`. All durations in ms. */
export interface Settings {
  /** Total working time per day (ms). */
  dailyHoursMaxMs: number;
  /** Override the daily budget for today only (ms). null = use daily. */
  todayHoursOverrideMs: number | null;
  /** Minimum allocation per ticket (ms). */
  perTicketMinMs: number;
  /** Maximum allocation per ticket (ms). null = uncapped. */
  perTicketMaxMs: number | null;

  /** Window opacity 0..1 when mouse is not hovering. */
  opacity: number;
  llmProvider: "openai" | "anthropic";
  llmModel: string;
  defaultLabel: string | null;
  longPressMs: number;
  hotkey: string | null;
  /** Linear poll interval (seconds). 0 = off. */
  linearPollIntervalSeconds: number;
  /** Auto-pull tickets on service start. */
  autoSyncOnStart: boolean;
}

export const HOUR_MS = 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

export const DEFAULT_SETTINGS: Settings = {
  dailyHoursMaxMs: 8 * HOUR_MS,
  todayHoursOverrideMs: null,
  perTicketMinMs: 10 * MIN_MS,
  perTicketMaxMs: null,
  opacity: 0.9,
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  defaultLabel: null,
  longPressMs: 400,
  hotkey: "CommandOrControl+Shift+Space",
  linearPollIntervalSeconds: 300,
  autoSyncOnStart: true,
};
