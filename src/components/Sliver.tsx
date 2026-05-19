import { useStore, useCurrentTicket } from "../state/store";
import { useLiveRemaining } from "./hooks";
import { formatHMS } from "../lib/time";

export function Sliver() {
  const setWindowState = useStore((s) => s.setWindowState);
  const timerStatus = useStore((s) => s.timerStatus);
  const resume = useStore((s) => s.resume);
  const cur = useCurrentTicket();
  const live = useLiveRemaining();

  const label = cur?.issue.identifier ?? "—";
  const title = cur?.issue.title ?? "no ticket";
  const status =
    timerStatus === "soft_paused" || timerStatus === "collapse_paused"
      ? "paused"
      : timerStatus === "running"
        ? "running"
        : "idle";

  // Single click expands the panel; if we were collapse-paused, also
  // resume. Dragging works via data-tauri-drag-region without firing a
  // click event.
  const onClick = async () => {
    await setWindowState("compact");
    if (timerStatus === "collapse_paused" || timerStatus === "soft_paused") {
      await resume();
    }
  };

  return (
    <div
      className="sliver"
      data-tauri-drag-region
      onClick={() => void onClick()}
      title={`${label} ${title} — click to expand`}
    >
      <span className="sliver-id">{label}</span>
      <span className="sliver-title">{title}</span>
      <span className={`sliver-timer status-${status}`}>
        {status === "paused" ? "⏸" : formatHMS(live)}
      </span>
    </div>
  );
}
