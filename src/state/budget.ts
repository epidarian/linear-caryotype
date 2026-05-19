import type { LinearIssue, Settings, TicketBudget } from "./types";
import { HOUR_MS } from "./types";

/** The day's total working budget (ms). Today override wins over daily. */
export function effectiveBudgetMs(settings: Settings): number {
  const base = settings.todayHoursOverrideMs ?? settings.dailyHoursMaxMs;
  return Math.max(0, base);
}

function clampTicketBudget(ms: number, settings: Settings): number {
  let b = Math.max(0, ms);
  if (settings.perTicketMinMs > 0) b = Math.max(b, settings.perTicketMinMs);
  if (settings.perTicketMaxMs != null && settings.perTicketMaxMs > 0) {
    b = Math.min(b, settings.perTicketMaxMs);
  }
  return b;
}

/** Initial allocation across ordered `issues`. Honors per-ticket Linear
 *  `estimate` (hours) when present; otherwise splits the remaining budget
 *  evenly. Result is clamped to `[perTicketMinMs, perTicketMaxMs]`. */
export function allocate(issues: LinearIssue[], settings: Settings): TicketBudget[] {
  if (issues.length === 0) return [];
  const totalMs = effectiveBudgetMs(settings);
  const estimated = issues.map((i) =>
    typeof i.estimate === "number" && i.estimate > 0 ? i.estimate * HOUR_MS : null,
  );
  const sumEst = estimated.reduce<number>((a, b) => a + (b ?? 0), 0);
  const unestimatedCount = estimated.filter((e) => e === null).length;
  const remainder = Math.max(0, totalMs - sumEst);
  const perUnestimated = unestimatedCount > 0 ? remainder / unestimatedCount : 0;

  return issues.map((issue, idx) => {
    const budget = clampTicketBudget(estimated[idx] ?? perUnestimated, settings);
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

/** Recompute remaining ticket budgets against the day's remaining budget.
 *  If the sum of remaining exceeds the available budget, scale down
 *  proportionally; tickets that would fall below `perTicketMinMs` are
 *  deferred and their slice redistributed across survivors. */
export function reflow(stack: TicketBudget[], settings: Settings): TicketBudget[] {
  const eligible = stack.filter(
    (t) => !t.doneCommitted && !t.deferred && !t.skippedToBack,
  );
  if (eligible.length === 0) return stack;

  const spentByEligible = eligible.reduce((a, b) => a + b.spentMs, 0);
  const R = Math.max(0, effectiveBudgetMs(settings) - spentByEligible);
  const P = eligible.reduce((a, b) => a + b.remainingMs, 0);
  if (P <= 0 || R >= P) return stack;

  const floor = settings.perTicketMinMs;
  let survivors = eligible.slice();
  const deferred = new Set<string>();
  for (;;) {
    const sumSurv = survivors.reduce((a, b) => a + b.remainingMs, 0);
    if (sumSurv <= 0) break;
    const s = R / sumSurv;
    const drop: string[] = [];
    survivors.forEach((t) => {
      if (t.remainingMs * s < floor) drop.push(t.issue.id);
    });
    if (drop.length === 0) break;
    drop.forEach((id) => deferred.add(id));
    survivors = survivors.filter((t) => !deferred.has(t.issue.id));
    if (survivors.length === 0) break;
  }
  const sumSurv = survivors.reduce((a, b) => a + b.remainingMs, 0);
  const s = sumSurv > 0 ? R / sumSurv : 1;

  return stack.map((t) => {
    if (deferred.has(t.issue.id)) return { ...t, deferred: true, remainingMs: 0 };
    if (t.doneCommitted || t.skippedToBack || t.deferred) return t;
    return { ...t, remainingMs: Math.max(0, t.remainingMs * s) };
  });
}

/** Redistribute `slack` ms across `stack`'s eligible tickets. */
export function redistribute(stack: TicketBudget[], slack: number): TicketBudget[] {
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
