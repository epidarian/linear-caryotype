import { invoke } from "@tauri-apps/api/core";
import type { WindowState } from "../state/types";

export function setWindowState(state: WindowState): Promise<void> {
  return invoke("set_window_state", { state });
}

export function edgeSnap(thresholdPx = 12): Promise<[number, number]> {
  return invoke<[number, number]>("edge_snap", {
    payload: { threshold_px: thresholdPx },
  });
}

export function startDragging(): Promise<void> {
  return invoke("start_dragging");
}
