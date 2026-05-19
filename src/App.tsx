import { useEffect, useRef, useState } from "react";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useStore } from "./state/store";
import { DEFAULT_SETTINGS, type Settings } from "./state/types";
import { isTauri } from "./api/settings";
import { Sliver } from "./components/Sliver";
import { TopEdge } from "./components/TopEdge";
import { NowBar } from "./components/NowBar";
import { TicketStack } from "./components/TicketStack";
import { LLMTray } from "./components/LLMTray";
import { ApprovalPanel } from "./components/ApprovalPanel";
import { DoneScreen } from "./components/DoneScreen";
import { EndDayModal } from "./components/EndDayModal";
import { SettingsPanel } from "./components/SettingsPanel";

export default function App() {
  const init = useStore((s) => s.init);
  const loadDay = useStore((s) => s.loadDay);
  const ready = useStore((s) => s.ready);
  const tick = useStore((s) => s.tick);
  const windowState = useStore((s) => s.windowState);
  const settings = useStore((s) => s.settings);
  const timerStatus = useStore((s) => s.timerStatus);
  const approvals = useStore((s) => s.approvals);
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const tickInterval = useRef<number | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!ready) return;
    if (tickInterval.current) window.clearInterval(tickInterval.current);
    tickInterval.current = window.setInterval(() => tick(), 500);
    return () => {
      if (tickInterval.current) window.clearInterval(tickInterval.current);
    };
  }, [ready, tick]);

  // Global show/hide hotkey.
  useEffect(() => {
    if (!ready || !settings.hotkey) return;
    let cancelled = false;
    (async () => {
      try {
        await unregisterAll();
        await register(settings.hotkey!, async () => {
          const w = getCurrentWindow();
          if (await w.isVisible()) await w.hide();
          else {
            await w.show();
            await w.setFocus();
          }
        });
      } catch (e) {
        if (!cancelled) console.warn("hotkey register failed", e);
      }
    })();
    return () => {
      cancelled = true;
      void unregisterAll();
    };
  }, [ready, settings.hotkey]);

  // Poller + config watcher events from the Rust backend.
  useEffect(() => {
    if (!ready || !isTauri()) return;
    let unlistenTickets: (() => void) | undefined;
    let unlistenConfig: (() => void) | undefined;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenTickets = await listen("tickets-updated", () => {
        void loadDay();
      });
      unlistenConfig = await listen<Settings>("config-reloaded", (ev) => {
        useStore.setState({
          settings: { ...DEFAULT_SETTINGS, ...ev.payload },
        });
      });
    })();
    return () => {
      unlistenTickets?.();
      unlistenConfig?.();
    };
  }, [ready, loadDay]);

  // Apply opacity via CSS variable; bump to 1 on hover.
  const liveOpacity = hovering ? 1 : settings.opacity;

  if (!ready) return null;

  const showDoneScreen = timerStatus === "done_pending";

  return (
    <div
      className={`root state-${windowState}`}
      style={{ ["--opacity" as any]: liveOpacity }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {windowState === "sliver" ? (
        <Sliver />
      ) : (
        <>
          <TopEdge
            onOpenSettings={() => setSettingsOpen(true)}
            onEndDay={() => setEndDayOpen(true)}
          />
          {windowState === "expanded" && !showDoneScreen && <TicketStack />}
          {showDoneScreen ? <DoneScreen /> : <NowBar />}
          <LLMTray />
        </>
      )}

      {approvals.length > 0 && <ApprovalPanel />}
      {endDayOpen && (
        <EndDayModal onClose={() => setEndDayOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
