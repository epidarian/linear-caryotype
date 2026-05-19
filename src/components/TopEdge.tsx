import { useState } from "react";
import { useStore } from "../state/store";
import { PauseButton } from "./PauseButton";

interface Props {
  onOpenSettings: () => void;
  onEndDay: () => void;
}

export function TopEdge({ onOpenSettings, onEndDay }: Props) {
  const windowState = useStore((s) => s.windowState);
  const setWindowState = useStore((s) => s.setWindowState);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setTrayOpen = useStore((s) => s.setTrayOpen);
  const trayOpen = useStore((s) => s.trayOpen);
  const [opacityPanel, setOpacityPanel] = useState(false);

  const nextExpand = windowState === "expanded" ? "compact" : "expanded";

  return (
    <div className="top-edge" data-tauri-drag-region>
      <button
        className="te-btn"
        onClick={onOpenSettings}
        title="Settings"
      >
        ⚙
      </button>
      <button
        className="te-btn"
        onClick={() => setOpacityPanel((v) => !v)}
        title="Opacity"
      >
        ◐
      </button>
      {opacityPanel && (
        <input
          type="range"
          min={0.4}
          max={1}
          step={0.02}
          value={settings.opacity}
          onChange={(e) => void setSettings({ opacity: Number(e.target.value) })}
          className="te-slider"
          title={`${Math.round(settings.opacity * 100)}%`}
        />
      )}
      <div className="te-spacer" data-tauri-drag-region />
      <button
        className="te-btn"
        onClick={() => setTrayOpen(!trayOpen)}
        title="LLM tray"
      >
        ✎
      </button>
      <button
        className="te-btn end-day"
        onClick={onEndDay}
        title="End day"
      >
        ⏻
      </button>
      <button
        className="te-btn"
        onClick={() => void setWindowState(nextExpand)}
        title={nextExpand === "expanded" ? "Expand" : "Collapse"}
      >
        {windowState === "expanded" ? "▼" : "▲"}
      </button>
      <PauseButton />
    </div>
  );
}
