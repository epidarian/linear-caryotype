import { useRef, useState } from "react";
import { useStore } from "../state/store";

/** Single button in the top-right whose gesture distinguishes:
 *  - Short click (release before `longPressMs`) → soft pause / resume.
 *  - Long press (≥ `longPressMs`) → collapse pause.
 *  A fill-ring animates around the icon during the press for feedback. */
export function PauseButton() {
  const timerStatus = useStore((s) => s.timerStatus);
  const softPause = useStore((s) => s.softPause);
  const resume = useStore((s) => s.resume);
  const collapsePause = useStore((s) => s.collapsePause);
  const longPressMs = useStore((s) => s.settings.longPressMs);

  const [pressing, setPressing] = useState(false);
  const downAt = useRef<number | null>(null);
  const longTimeout = useRef<number | null>(null);
  const consumed = useRef<boolean>(false);

  const isPaused = timerStatus === "soft_paused" || timerStatus === "collapse_paused";

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    // Resume via short click happens in onPointerUp; no long-press from
    // paused state.
    if (isPaused) return;
    downAt.current = Date.now();
    consumed.current = false;
    setPressing(true);
    longTimeout.current = window.setTimeout(() => {
      consumed.current = true;
      setPressing(false);
      void collapsePause();
    }, longPressMs);
  };

  const onPointerUp = () => {
    if (longTimeout.current) {
      window.clearTimeout(longTimeout.current);
      longTimeout.current = null;
    }
    setPressing(false);
    if (consumed.current) return;
    if (isPaused) {
      void resume();
    } else if (timerStatus === "running") {
      void softPause();
    } else if (timerStatus === "idle") {
      void useStore.getState().start();
    }
  };

  const onPointerCancel = () => {
    if (longTimeout.current) window.clearTimeout(longTimeout.current);
    setPressing(false);
    consumed.current = false;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) void collapsePause();
      else if (isPaused) void resume();
      else if (timerStatus === "running") void softPause();
      else void useStore.getState().start();
    }
  };

  const icon = isPaused ? "▶" : "⏸";
  const title = isPaused
    ? "Resume (click)"
    : "Soft pause (click) · Collapse pause (hold)";

  return (
    <button
      className={`te-btn pause-btn ${pressing ? "pressing" : ""} ${isPaused ? "paused" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onKeyDown={onKeyDown}
      style={{ ["--press-ms" as any]: `${longPressMs}ms` }}
      title={title}
    >
      <span className="pause-icon">{icon}</span>
      <span className="pause-ring" />
    </button>
  );
}
