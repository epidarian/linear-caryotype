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
  /** Allocated minutes for today. */
  budgetMs: number;
  /** Remaining minutes (decreases while active). */
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

export interface WorkingWindow {
  /** HH:MM local. */
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
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

export interface Settings {
  workingWindow: WorkingWindow;
  /** Window opacity 0..1 when mouse is not hovering. */
  opacity: number;
  llmProvider: "openai" | "anthropic";
  llmModel: string;
  defaultLabel: string | null;
  perTicketFloorMs: number;
  longPressMs: number;
  hotkey: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  workingWindow: {
    start: "09:00",
    end: "17:00",
    lunchStart: "12:30",
    lunchEnd: "13:00",
  },
  opacity: 0.9,
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  defaultLabel: null,
  perTicketFloorMs: 10 * 60 * 1000,
  longPressMs: 400,
  hotkey: "CommandOrControl+Shift+Space",
};
