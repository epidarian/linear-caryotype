import { invoke } from "@tauri-apps/api/core";

export type HistoryEvent =
  | "start"
  | "soft_pause"
  | "collapse_pause"
  | "resume"
  | "skip"
  | "done_pending"
  | "done_committed"
  | "deferred"
  | "end_day"
  | "note";

export interface HistoryRow {
  id: number;
  ts_ms: number;
  ticket_id: string | null;
  ticket_identifier: string | null;
  event: string;
  duration_ms: number | null;
  note_text: string | null;
}

export interface LogInput {
  event: HistoryEvent;
  ticket_id?: string | null;
  ticket_identifier?: string | null;
  duration_ms?: number | null;
  note_text?: string | null;
  ts_ms?: number | null;
}

export function log(input: LogInput): Promise<number> {
  return invoke<number>("history_log", { input });
}

export interface QueryFilters {
  since_ms?: number | null;
  until_ms?: number | null;
  ticket_id?: string | null;
  events?: string[] | null;
  limit?: number | null;
}

export function query(filters: QueryFilters = {}): Promise<HistoryRow[]> {
  return invoke<HistoryRow[]>("history_query", { filters });
}

export function today(): Promise<HistoryRow[]> {
  return invoke<HistoryRow[]>("history_today");
}

export function recentForTicket(ticketId: string, limit = 200): Promise<HistoryRow[]> {
  return invoke<HistoryRow[]>("history_recent_for_ticket", { ticketId, limit });
}
