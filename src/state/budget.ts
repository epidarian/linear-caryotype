import type { LinearIssue, Settings, TicketBudget } from "./types";
import { HOUR, remainingWorkingMs } from "../lib/time";

/** Initial allocation across `issues`. Ordering preserved (sorted upstream).
 *  Honors per-ticket Linear `estimate` (hours) if present, otherwise an
 *  equal split of the available working window. */
export function allocate(issues: LinearIssue[], settings: Settings): TicketBudget[] {
  const now = new Date();
  const totalMs = remainingWorkingMs(
    now,
    settings.workingWindow.start,
    settings.workingWindow.end,
    settings.workingWindow.lunchStart,
    settings.workingWindow.lunchEnd,
  );
  if (issues.length === 0) return [];

  // First pass: honor estimates as hard requests up to the total budget;
  // the remainder is split equally among ticketless-estimate issues.
  const estimated = issues.map((i) =>
    typeof i.estimate === "number" && i.estimate > 0 ? i.estimate * HOUR : null,
  );
  const sumEst = estimated.reduce<number>((a, b) => a + (b ?? 0), 0);
  const unestimatedCount = estimated.filter((e) => e === null).length;
  const remainder = Math.max(0, totalMs - sumEst);
  const perUnestimated = unestimatedCount > 0 ? remainder / unestimatedCount : 0;

  return issues.map((issue, idx) => {
    const budget = estimated[idx] ?? perUnestimated;
    return {
      issue,
      budgetMs: budget,
      remainingMs: budget,
      spentMs: 0,
      deferred: false,
      donePending: false,
      doneCommitted: false,
      skippedToBack: false,
    };
  });
}

/** Recompute remaining ticket budgets against actual remaining clock.
 *  If `R < P`, scale proportionally; tickets dropping below `floor` are
 *  flagged deferred. Active (done/skipped) tickets keep their remaining. */
export function reflow(
  stack: TicketBudget[],
  settings: Settings,
  now: Date = new Date(),
): TicketBudget[] {
  const eligible = stack.filter(
    (t) => !t.doneCommitted && !t.deferred && !t.skippedToBack,
  );
  if (eligible.length === 0) return stack;
  const R = remainingWorkingMs(
    now,
    settings.workingWindow.start,
    settings.workingWindow.end,
    settings.workingWindow.lunchStart,
    settings.workingWindow.lunchEnd,
  );
  const P = eligible.reduce((a, b) => a + b.remainingMs, 0);
  if (P <= 0) return stack;

  const scale = R / P;
  if (scale >= 1) return stack;

  const floor = settings.perTicketFloorMs;
  // Mark tickets that would drop below the floor as deferred; redistribute
  // their slice across survivors and rescale.
  let survivors = eligible.slice();
  let deferred = new Set<string>();
  // Iterate until no more drops; rare to exceed 2 passes.
  for (;;) {
    const sumSurv = survivors.reduce((a, b) => a + b.remainingMs, 0);
    if (sumSurv <= 0) break;
    const s = R / sumSurv;
    const newRemaining = survivors.map((t) => t.remainingMs * s);
    const drop: string[] = [];
    newRemaining.forEach((r, i) => {
      if (r < floor) drop.push(survivors[i].issue.id);
    });
    if (drop.length === 0) break;
    drop.forEach((id) => deferred.add(id));
    survivors = survivors.filter((t) => !deferred.has(t.issue.id));
    if (survivors.length === 0) break;
  }

  const sumSurv = survivors.reduce((a, b) => a + b.remainingMs, 0);
  const s = sumSurv > 0 ? R / sumSurv : 1;

  return stack.map((t) => {
    if (deferred.has(t.issue.id)) {
      return { ...t, deferred: true, remainingMs: 0 };
    }
    if (t.doneCommitted || t.skippedToBack || t.deferred) return t;
    return { ...t, remainingMs: Math.max(0, t.remainingMs * s) };
  });
}

/** Redistribute `slack` ms across `stack`'s eligible tickets. */
export function redistribute(
  stack: TicketBudget[],
  slack: number,
): TicketBudget[] {
  const eligible = stack.filter(
    (t) => !t.doneCommitted && !t.deferred && !t.skippedToBack,
  );
  if (eligible.length === 0 || slack <= 0) return stack;
  const share = slack / eligible.length;
  return stack.map((t) =>
    eligible.includes(t)
      ? { ...t, remainingMs: t.remainingMs + share, budgetMs: t.budgetMs + share }
      : t,
  );
}
