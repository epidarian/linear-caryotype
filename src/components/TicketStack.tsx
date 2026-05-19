import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { formatMinutes } from "../lib/time";

/** Horizontal scrollable stack. Current ticket is centred / largest.
 *  Scroll wheel cycles through; click a card to jump. */
export function TicketStack() {
  const stack = useStore((s) => s.stack);
  const currentIndex = useStore((s) => s.currentIndex);
  const setCurrentIndex = useStore((s) => s.setCurrentIndex);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(`.card.idx-${currentIndex}`);
    if (card) card.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  const onWheel = (e: React.WheelEvent) => {
    // Convert vertical wheel to horizontal cycling.
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    const nextIdx = clamp(currentIndex + delta, 0, stack.length - 1);
    if (nextIdx !== currentIndex) void setCurrentIndex(nextIdx);
  };

  if (stack.length === 0) {
    return <div className="stack empty">no tickets</div>;
  }

  return (
    <div className="stack" ref={ref} onWheel={onWheel}>
      {stack.map((t, i) => {
        const cls = [
          "card",
          `idx-${i}`,
          i === currentIndex ? "current" : "",
          t.doneCommitted ? "done" : "",
          t.deferred ? "deferred" : "",
          t.skippedToBack ? "skipped" : "",
          t.donePending ? "done-pending" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button key={t.issue.id} className={cls} onClick={() => void setCurrentIndex(i)}>
            <div className="card-id">{t.issue.identifier}</div>
            <div className="card-title" title={t.issue.title}>
              {t.issue.title}
            </div>
            <div className="card-meta">
              {t.doneCommitted
                ? "done"
                : t.deferred
                  ? "deferred"
                  : formatMinutes(t.remainingMs)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
