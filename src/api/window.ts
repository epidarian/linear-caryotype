import type { WindowState } from "../state/types";

// [stub-data] Window state changes are visual-only when not running inside
// Tauri (e.g. `npm run dev` in a browser). If Tauri is present, we still
// forward the calls so the actual OS window resizes correctly.

const TAURI =
  typeof window !== "undefined" &&
  // Tauri 2 injects this global.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

async function tauriInvoke<T>(cmd: string, args: unknown): Promise<T | null> {
  if (!TAURI) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke(cmd, args as Record<string, unknown>)) as T;
  } catch (e) {
    console.warn(`[stub] tauri ${cmd} failed`, e);
    return null;
  }
}

export async function setWindowState(state: WindowState): Promise<void> {
  await tauriInvoke("set_window_state", { state });
}

export async function edgeSnap(thresholdPx = 12): Promise<[number, number]> {
  const r = await tauriInvoke<[number, number]>("edge_snap", {
    payload: { threshold_px: thresholdPx },
  });
  return r ?? [0, 0];
}

export async function startDragging(): Promise<void> {
  await tauriInvoke("start_dragging", {});
}
