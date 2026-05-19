import type { KeylogConfig } from "../state/types";
import {
  KEYLOG_CHUNKS,
  KEYLOG_CONFIG,
  delay,
  setKeylogConfig,
} from "./_stubs";

// [stub-data] Keylog config + chunks live in memory and reset on reload.

export interface KeylogChunk {
  id: number;
  ticket_id: string | null;
  interval_start_ms: number;
  interval_end_ms: number;
  digest: string;
}

export async function getConfig(): Promise<KeylogConfig> {
  return delay(KEYLOG_CONFIG, 0);
}

export async function setConfig(config: KeylogConfig): Promise<void> {
  setKeylogConfig(config);
  return delay(undefined, 0);
}

export async function purge(): Promise<void> {
  KEYLOG_CHUNKS.length = 0;
  return delay(undefined, 0);
}

export async function chunksForTicket(ticketId: string, sinceMs?: number): Promise<KeylogChunk[]> {
  let rows = KEYLOG_CHUNKS.filter((c) => c.ticket_id === ticketId);
  if (sinceMs != null) rows = rows.filter((c) => c.interval_end_ms >= sinceMs);
  return delay(rows, 0);
}

export async function setActiveTicket(
  ticketId: string | null,
  intervalStartMs: number | null,
): Promise<void> {
  void ticketId;
  void intervalStartMs;
  return delay(undefined, 0);
}
