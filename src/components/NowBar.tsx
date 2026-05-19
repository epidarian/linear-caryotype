import { useStore, useCurrentTicket } from "../state/store";
import { useLiveRemaining } from "./hooks";
import { formatHMS } from "../lib/time";

export function NowBar() {
  const cur = useCurrentTicket();
  const live = useLiveRemaining();
  const timerStatus = useStore((s) => s.timerStatus);
  const skip = useStore((s) => s.skip);
  const pressDone = useStore((s) => s.pressDone);
  const start = useStore((s) => s.start);
  const loadDay = useStore((s) => s.loadDay);

  if (!cur) {
    return (
      <div className="nowbar empty">
        <span>No tickets loaded.</span>
        <button onClick={() => void loadDay()}>Load today</button>
      </div>
    );
  }

  const running = timerStatus === "running";

  return (
    <div className="nowbar">
      <div className="nowbar-main">
        <div className="ticket-id">{cur.issue.identifier}</div>
        <div className="ticket-title" title={cur.issue.title}>
          {cur.issue.title}
        </div>
      </div>
      <div className={`countdown ${running ? "running" : "paused"}`}>
        {formatHMS(live)}
      </div>
      <div className="nowbar-controls">
        {timerStatus === "idle" && (
          <button className="ctrl-btn" onClick={() => void start()}>
            Start
          </button>
        )}
        <button className="ctrl-btn" onClick={() => void skip()} title="Skip">
          ⤼
        </button>
        <button className="ctrl-btn done" onClick={() => void pressDone()} title="Done">
          ✓
        </button>
      </div>
    </div>
  );
}
