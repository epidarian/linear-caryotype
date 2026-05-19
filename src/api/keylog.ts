import { invoke } from "@tauri-apps/api/core";
import type { KeylogConfig } from "../state/types";

export interface KeylogChunk {
  id: number;
  ticket_id: string | null;
  interval_start_ms: number;
  interval_end_ms: number;
  digest: string;
}

export function getConfig(): Promise<KeylogConfig> {
  return invoke<KeylogConfig>("keylog_get_config");
}

export function setConfig(config: KeylogConfig): Promise<void> {
  return invoke("keylog_set_config", { config });
}

export function purge(): Promise<void> {
  return invoke("keylog_purge");
}

export function chunksForTicket(ticketId: string, sinceMs?: number): Promise<KeylogChunk[]> {
  return invoke<KeylogChunk[]>("keylog_chunks_for_ticket", {
    ticketId,
    sinceMs: sinceMs ?? null,
  });
}

export function setActiveTicket(
  ticketId: string | null,
  intervalStartMs: number | null,
): Promise<void> {
  return invoke("keylog_set_active_ticket", {
    ticketId,
    intervalStartMs,
  });
}
