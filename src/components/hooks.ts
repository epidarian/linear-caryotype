import { useEffect, useState } from "react";
import { useStore } from "../state/store";

/** Compute the active ticket's live remaining ms by combining its stored
 *  `remainingMs` with the current running interval. Subscribes to
 *  intervalStartMs / stack / currentIndex so it updates on transitions and
 *  ticks itself with a 250ms loop while running. */
export function useLiveRemaining(): number {
  const stack = useStore((s) => s.stack);
  const idx = useStore((s) => s.currentIndex);
  const intervalStartMs = useStore((s) => s.intervalStartMs);
  const status = useStore((s) => s.timerStatus);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const cur = stack[idx];
  if (!cur) return 0;
  const elapsed = status === "running" && intervalStartMs != null ? now - intervalStartMs : 0;
  return Math.max(0, cur.remainingMs - elapsed);
}
