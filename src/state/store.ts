import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";

import { allocate, redistribute, reflow } from "./budget";
import {
  ApprovalProposal,
  DEFAULT_SETTINGS,
  LinearIssue,
  Settings,
  TicketBudget,
  TimerStatus,
  WindowState,
} from "./types";

import * as linear from "../api/linear";
import * as history from "../api/history";
import * as keylog from "../api/keylog";
import * as windowApi from "../api/window";

const persistStore = new LazyStore("settings.json");

interface State {
  ready: boolean;
  windowState: WindowState;
  timerStatus: TimerStatus;
  /** Tickets for today, ordered. */
  stack: TicketBudget[];
  /** Index in `stack` of the active card. */
  currentIndex: number;
  /** Wall-clock ms when the current interval started (running only). */
  intervalStartMs: number | null;
  /** Settings, persisted via tauri-plugin-store. */
  settings: Settings;
  /** Pending Linear approval proposals. */
  approvals: ApprovalProposal[];
  /** Tray open/closed. */
  trayOpen: boolean;
  /** Last error to surface in UI. */
  lastError: string | null;
}

interface Actions {
  init: () => Promise<void>;
  setWindowState: (state: WindowState) => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  loadDay: () => Promise<void>;
  setStack: (stack: TicketBudget[]) => void;
  setCurrentIndex: (idx: number) => Promise<void>;
  start: () => Promise<void>;
  softPause: () => Promise<void>;
  collapsePause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  pressDone: () => Promise<void>;
  commitDone: () => Promise<void>;
  cancelDonePending: () => void;
  endDay: () => Promise<void>;
  reflowNow: () => void;
  addApproval: (p: ApprovalProposal) => void;
  removeApproval: (id: string) => void;
  setTrayOpen: (open: boolean) => void;
  setError: (msg: string | null) => void;
  tick: () => void;
}

export const useStore = create<State & Actions>((set, get) => ({
  ready: false,
  windowState: "compact",
  timerStatus: "idle",
  stack: [],
  currentIndex: 0,
  intervalStartMs: null,
  settings: DEFAULT_SETTINGS,
  approvals: [],
  trayOpen: false,
  lastError: null,

  init: async () => {
    try {
      const saved = (await persistStore.get<Partial<Settings>>("settings")) ?? {};
      set({
        settings: { ...DEFAULT_SETTINGS, ...saved },
        ready: true,
      });
    } catch (e) {
      set({ ready: true, lastError: String(e) });
    }
  },

  setWindowState: async (state) => {
    set({ windowState: state });
    try {
      await windowApi.setWindowState(state);
    } catch (e) {
      set({ lastError: String(e) });
    }
  },

  setSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      await persistStore.set("settings", next);
      await persistStore.save();
    } catch (e) {
      set({ lastError: String(e) });
    }
  },

  loadDay: async () => {
    try {
      const issues = await linear.fetchToday(get().settings.defaultLabel);
      const ordered = orderForDay(issues);
      const stack = allocate(ordered, get().settings);
      set({ stack, currentIndex: 0 });
    } catch (e) {
      set({ lastError: `loadDay failed: ${e}` });
    }
  },

  setStack: (stack) => set({ stack }),

  setCurrentIndex: async (idx) => {
    const { stack, timerStatus } = get();
    if (idx < 0 || idx >= stack.length) return;
    set({ currentIndex: idx });
    // If a timer is running, restart the interval against the new ticket.
    if (timerStatus === "running") {
      await get().softPause();
      await get().start();
    }
  },

  start: async () => {
    const { stack, currentIndex } = get();
    const cur = stack[currentIndex];
    if (!cur) return;
    const now = Date.now();
    set({ timerStatus: "running", intervalStartMs: now });
    await history.log({
      event: "start",
      ticket_id: cur.issue.id,
      ticket_identifier: cur.issue.identifier,
    });
    await keylog.setActiveTicket(cur.issue.id, now);
  },

  softPause: async () => {
    const { intervalStartMs, currentIndex, stack } = get();
    if (intervalStartMs == null) {
      set({ timerStatus: "soft_paused" });
      return;
    }
    const now = Date.now();
    const elapsed = now - intervalStartMs;
    const cur = stack[currentIndex];
    const next = stack.slice();
    if (cur) {
      next[currentIndex] = {
        ...cur,
        spentMs: cur.spentMs + elapsed,
        remainingMs: Math.max(0, cur.remainingMs - elapsed),
      };
    }
    set({
      timerStatus: "soft_paused",
      intervalStartMs: null,
      stack: next,
    });
    if (cur) {
      await history.log({
        event: "soft_pause",
        ticket_id: cur.issue.id,
        ticket_identifier: cur.issue.identifier,
        duration_ms: elapsed,
      });
    }
    await keylog.setActiveTicket(null, null);
    get().reflowNow();
  },

  collapsePause: async () => {
    await get().softPause();
    set({ timerStatus: "collapse_paused" });
    const { currentIndex, stack } = get();
    const cur = stack[currentIndex];
    if (cur) {
      await history.log({
        event: "collapse_pause",
        ticket_id: cur.issue.id,
        ticket_identifier: cur.issue.identifier,
      });
    }
    await get().setWindowState("sliver");
  },

  resume: async () => {
    const { windowState } = get();
    if (windowState === "sliver") await get().setWindowState("compact");
    await get().start();
    const cur = get().stack[get().currentIndex];
    if (cur) {
      await history.log({
        event: "resume",
        ticket_id: cur.issue.id,
        ticket_identifier: cur.issue.identifier,
      });
    }
  },

  skip: async () => {
    await get().softPause();
    const { stack, currentIndex } = get();
    if (stack.length === 0) return;
    const cur = stack[currentIndex];
    const next = stack.slice();
    if (cur) next[currentIndex] = { ...cur, skippedToBack: true };
    // Move the skipped card to the back; advance to the first eligible
    // ticket in the new order (preferring the slot that was next).
    const reordered = [
      ...next.slice(0, currentIndex),
      ...next.slice(currentIndex + 1),
      next[currentIndex],
    ];
    const nextIdx = pickNextEligible(reordered, currentIndex, cur?.issue.id);
    set({ stack: reordered, currentIndex: nextIdx });
    if (cur) {
      await history.log({
        event: "skip",
        ticket_id: cur.issue.id,
        ticket_identifier: cur.issue.identifier,
      });
    }
    get().reflowNow();
  },

  pressDone: async () => {
    const { timerStatus, stack, currentIndex } = get();
    const cur = stack[currentIndex];
    if (!cur) return;
    if (timerStatus !== "done_pending") {
      // First press: pause, enter done_pending, expand the window.
      await get().softPause();
      set({ timerStatus: "done_pending" });
      const next = stack.slice();
      next[currentIndex] = { ...cur, donePending: true };
      set({ stack: next });
      await get().setWindowState("expanded");
      await history.log({
        event: "done_pending",
        ticket_id: cur.issue.id,
        ticket_identifier: cur.issue.identifier,
      });
    } else {
      // Second press: commit.
      await get().commitDone();
    }
  },

  commitDone: async () => {
    const { stack, currentIndex } = get();
    const cur = stack[currentIndex];
    if (!cur) return;
    const next = stack.slice();
    const slack = cur.remainingMs;
    next[currentIndex] = {
      ...cur,
      doneCommitted: true,
      donePending: false,
      remainingMs: 0,
    };
    const after = redistribute(next, slack);
    // Advance to next non-done, non-deferred ticket.
    const nextIdx = after.findIndex(
      (t, i) => i !== currentIndex && !t.doneCommitted && !t.deferred,
    );
    set({
      stack: after,
      currentIndex: nextIdx === -1 ? currentIndex : nextIdx,
      timerStatus: "idle",
    });
    await history.log({
      event: "done_committed",
      ticket_id: cur.issue.id,
      ticket_identifier: cur.issue.identifier,
    });
    await get().setWindowState("compact");
  },

  cancelDonePending: () => {
    const { stack, currentIndex } = get();
    const cur = stack[currentIndex];
    if (!cur) return;
    const next = stack.slice();
    next[currentIndex] = { ...cur, donePending: false };
    set({ stack: next, timerStatus: "soft_paused" });
  },

  endDay: async () => {
    await get().softPause();
    set({ timerStatus: "ended" });
    const { stack } = get();
    // Mark any still-eligible tickets as deferred.
    const next = stack.map((t) =>
      t.doneCommitted || t.deferred ? t : { ...t, deferred: true },
    );
    set({ stack: next });
    await history.log({ event: "end_day" });
    for (const t of next) {
      if (t.deferred && !t.doneCommitted) {
        await history.log({
          event: "deferred",
          ticket_id: t.issue.id,
          ticket_identifier: t.issue.identifier,
          note_text: t.skippedToBack ? "skipped" : "reflow",
        });
      }
    }
  },

  reflowNow: () => {
    set({ stack: reflow(get().stack, get().settings) });
  },

  addApproval: (p) => set({ approvals: [...get().approvals, p] }),
  removeApproval: (id) => set({ approvals: get().approvals.filter((p) => p.id !== id) }),

  setTrayOpen: (open) => set({ trayOpen: open }),
  setError: (msg) => set({ lastError: msg }),

  tick: () => {
    const { timerStatus, intervalStartMs, stack, currentIndex } = get();
    if (timerStatus !== "running" || intervalStartMs == null) return;
    const cur = stack[currentIndex];
    if (!cur) return;
    const now = Date.now();
    const elapsed = now - intervalStartMs;
    const remaining = Math.max(0, cur.remainingMs - elapsed);
    // We don't mutate stack on every tick to avoid renders cascading;
    // components read intervalStartMs + remainingMs and compute live.
    if (remaining <= 0 && cur.remainingMs > 0) {
      // Budget exhausted; flip to soft pause so user can decide.
      void get().softPause();
    }
  },
}));

/** Pick the next index that is not the just-skipped card and is not
 *  already done/deferred. Falls back to whatever's available, or the
 *  hint index if everything is exhausted. */
function pickNextEligible(
  stack: TicketBudget[],
  hintIndex: number,
  skippedId: string | undefined,
): number {
  const isEligible = (t: TicketBudget): boolean =>
    !t.doneCommitted && !t.deferred && t.issue.id !== skippedId;
  for (let i = hintIndex; i < stack.length; i++) {
    if (isEligible(stack[i])) return i;
  }
  for (let i = 0; i < hintIndex; i++) {
    if (isEligible(stack[i])) return i;
  }
  return Math.min(hintIndex, Math.max(0, stack.length - 1));
}

/** Order tickets for the day: higher Linear priority first, then by
 *  identifier so the sort is deterministic. */
function orderForDay(issues: LinearIssue[]): LinearIssue[] {
  return issues.slice().sort((a, b) => {
    // Linear priority: 1=Urgent, 2=High, 3=Medium, 4=Low, 0=None.
    // Treat 0 as worst.
    const pa = a.priority === 0 ? 99 : a.priority;
    const pb = b.priority === 0 ? 99 : b.priority;
    if (pa !== pb) return pa - pb;
    return a.identifier.localeCompare(b.identifier);
  });
}

/** Hook that subscribes to the current ticket; re-renders on stack /
 *  index changes. */
export function useCurrentTicket(): TicketBudget | undefined {
  return useStore((s) => s.stack[s.currentIndex]);
}
