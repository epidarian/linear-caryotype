/** Time helpers for the working-day math. All times in ms unless noted. */

export const MIN = 60_000;
export const HOUR = 60 * MIN;

export function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return { h: h || 0, m: m || 0 };
}

/** Wall-clock ms today at HH:MM local, relative to `now`. */
export function todayAt(now: Date, hhmm: string): Date {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Total working ms in the window today (excluding lunch). */
export function totalWorkingMs(
  now: Date,
  start: string,
  end: string,
  lunchStart?: string,
  lunchEnd?: string,
): number {
  const s = todayAt(now, start).getTime();
  const e = todayAt(now, end).getTime();
  let total = Math.max(0, e - s);
  if (lunchStart && lunchEnd) {
    const ls = todayAt(now, lunchStart).getTime();
    const le = todayAt(now, lunchEnd).getTime();
    if (ls < le) total -= Math.max(0, le - ls);
  }
  return Math.max(0, total);
}

/** Remaining working ms from `now` until end-of-day (excluding any
 *  remaining lunch slice). */
export function remainingWorkingMs(
  now: Date,
  start: string,
  end: string,
  lunchStart?: string,
  lunchEnd?: string,
): number {
  const nowMs = now.getTime();
  const s = todayAt(now, start).getTime();
  const e = todayAt(now, end).getTime();
  if (nowMs >= e) return 0;
  const from = Math.max(nowMs, s);
  let total = Math.max(0, e - from);
  if (lunchStart && lunchEnd) {
    const ls = todayAt(now, lunchStart).getTime();
    const le = todayAt(now, lunchEnd).getTime();
    const overlap = Math.max(0, Math.min(le, e) - Math.max(ls, from));
    total -= overlap;
  }
  return Math.max(0, total);
}

export function formatHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatMinutes(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}
