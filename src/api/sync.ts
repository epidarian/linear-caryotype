import { invoke } from "@tauri-apps/api/core";
import type { LinearIssue } from "../state/types";

export function syncTicketsNow(): Promise<LinearIssue[]> {
  return invoke<LinearIssue[]>("linear_sync_now");
}
