import { HISTORY, historyInsert, delay } from "./_stubs";

// [stub-data] In-memory history. Resets on page reload.

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

export async function log(input: LogInput): Promise<number> {
  return delay(historyInsert(input), 0);
}

export interface QueryFilters {
  since_ms?: number | null;
  until_ms?: number | null;
  ticket_id?: string | null;
  events?: string[] | null;
  limit?: number | null;
}

export async function query(filters: QueryFilters = {}): Promise<HistoryRow[]> {
  let rows = HISTORY.slice();
  if (filters.since_ms != null) rows = rows.filter((r) => r.ts_ms >= filters.since_ms!);
  if (filters.until_ms != null) rows = rows.filter((r) => r.ts_ms <= filters.until_ms!);
  if (filters.ticket_id) rows = rows.filter((r) => r.ticket_id === filters.ticket_id);
  if (filters.events && filters.events.length > 0) {
    rows = rows.filter((r) => filters.events!.includes(r.event));
  }
  rows.sort((a, b) => a.ts_ms - b.ts_ms);
  if (filters.limit != null) rows = rows.slice(0, filters.limit);
  return delay(rows, 0);
}

export async function today(): Promise<HistoryRow[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return query({ since_ms: start.getTime() });
}

export async function recentForTicket(ticketId: string, limit = 200): Promise<HistoryRow[]> {
  return query({ ticket_id: ticketId, limit });
}
