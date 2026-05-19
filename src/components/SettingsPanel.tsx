import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../state/store";
import * as secrets from "../api/secrets";
import * as keylog from "../api/keylog";
import type { KeyName } from "../api/secrets";
import { HOUR_MS, MIN_MS, type KeylogConfig } from "../state/types";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [keyState, setKeyState] = useState<Record<KeyName, string>>({
    linear: "",
    openai: "",
    anthropic: "",
  });
  const [keyPresent, setKeyPresent] = useState<Record<KeyName, boolean>>({
    linear: false,
    openai: false,
    anthropic: false,
  });
  const [keylogCfg, setKeylogCfg] = useState<KeylogConfig | null>(null);
  const [savingKey, setSavingKey] = useState<KeyName | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      for (const n of ["linear", "openai", "anthropic"] as KeyName[]) {
        try {
          const v = await secrets.getApiKey(n);
          setKeyPresent((p) => ({ ...p, [n]: !!v }));
        } catch {
          /* ignore */
        }
      }
      try {
        setKeylogCfg(await keylog.getConfig());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const saveKey = async (name: KeyName) => {
    setSavingKey(name);
    setSaveMsg(null);
    try {
      await secrets.setApiKey(name, keyState[name]);
      setKeyPresent((p) => ({ ...p, [name]: true }));
      setKeyState((k) => ({ ...k, [name]: "" }));
      setSaveMsg(`${name} key saved`);
    } catch (e) {
      setSaveMsg(`${name} save failed: ${e}`);
    } finally {
      setSavingKey(null);
    }
  };

  const clearKey = async (name: KeyName) => {
    await secrets.clearApiKey(name);
    setKeyPresent((p) => ({ ...p, [name]: false }));
  };

  const saveKeylog = async (cfg: KeylogConfig) => {
    setKeylogCfg(cfg);
    await keylog.setConfig(cfg);
  };

  const purge = async () => {
    if (!confirm("Purge ALL stored keystroke chunks?")) return;
    await keylog.purge();
  };

  const pickPath = async () => {
    const result = await openDialog({ multiple: false, directory: false });
    if (typeof result === "string" && keylogCfg) {
      await saveKeylog({ ...keylogCfg, path: result });
    }
  };

  const dailyHours = settings.dailyHoursMaxMs / HOUR_MS;
  const todayHours =
    settings.todayHoursOverrideMs == null ? "" : settings.todayHoursOverrideMs / HOUR_MS;
  const minMinutes = settings.perTicketMinMs / MIN_MS;
  const maxMinutes =
    settings.perTicketMaxMs == null ? "" : settings.perTicketMaxMs / MIN_MS;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <section>
          <h4>API keys</h4>
          {(["linear", "openai", "anthropic"] as KeyName[]).map((n) => (
            <div key={n} className="kv-row">
              <label>{n}</label>
              <input
                type="password"
                value={keyState[n]}
                placeholder={keyPresent[n] ? "(saved · enter new to replace)" : "not set"}
                onChange={(e) => setKeyState({ ...keyState, [n]: e.target.value })}
              />
              <button onClick={() => void saveKey(n)} disabled={savingKey === n || !keyState[n]}>
                Save
              </button>
              <button onClick={() => void clearKey(n)} disabled={!keyPresent[n]}>
                Clear
              </button>
            </div>
          ))}
          {saveMsg && <div className="muted">{saveMsg}</div>}
        </section>

        <section>
          <h4>Working hours</h4>
          <div className="kv-row">
            <label>Daily (hours)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={dailyHours}
              onChange={(e) =>
                void setSettings({ dailyHoursMaxMs: Number(e.target.value) * HOUR_MS })
              }
            />
            <label>Today override (hours)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={todayHours}
              placeholder="(none)"
              onChange={(e) =>
                void setSettings({
                  todayHoursOverrideMs:
                    e.target.value === "" ? null : Number(e.target.value) * HOUR_MS,
                })
              }
            />
          </div>
          <div className="kv-row">
            <label>Per-ticket min (min)</label>
            <input
              type="number"
              min={1}
              value={minMinutes}
              onChange={(e) =>
                void setSettings({ perTicketMinMs: Number(e.target.value) * MIN_MS })
              }
            />
            <label>Per-ticket max (min)</label>
            <input
              type="number"
              min={0}
              value={maxMinutes}
              placeholder="(uncapped)"
              onChange={(e) =>
                void setSettings({
                  perTicketMaxMs:
                    e.target.value === "" ? null : Number(e.target.value) * MIN_MS,
                })
              }
            />
          </div>
          <div className="kv-row">
            <label>Long-press (ms)</label>
            <input
              type="number"
              min={150}
              value={settings.longPressMs}
              onChange={(e) => void setSettings({ longPressMs: Number(e.target.value) })}
            />
            <label>Poll interval (sec)</label>
            <input
              type="number"
              min={0}
              value={settings.linearPollIntervalSeconds}
              onChange={(e) =>
                void setSettings({ linearPollIntervalSeconds: Number(e.target.value) })
              }
            />
          </div>
        </section>

        <section>
          <h4>LLM</h4>
          <div className="kv-row">
            <label>Provider</label>
            <select
              value={settings.llmProvider}
              onChange={(e) =>
                void setSettings({ llmProvider: e.target.value as "openai" | "anthropic" })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <label>Model</label>
            <input
              value={settings.llmModel}
              onChange={(e) => void setSettings({ llmModel: e.target.value })}
            />
          </div>
        </section>

        <section>
          <h4>Linear</h4>
          <div className="kv-row">
            <label>Default label filter</label>
            <input
              value={settings.defaultLabel ?? ""}
              placeholder="(optional, e.g. today)"
              onChange={(e) => void setSettings({ defaultLabel: e.target.value || null })}
            />
            <label>Auto-sync on start</label>
            <input
              type="checkbox"
              checked={settings.autoSyncOnStart}
              onChange={(e) => void setSettings({ autoSyncOnStart: e.target.checked })}
            />
          </div>
        </section>

        <section>
          <h4>Keystroke log ingestion</h4>
          {keylogCfg ? (
            <>
              <div className="kv-row">
                <label>Expect a keystroke logger</label>
                <input
                  type="checkbox"
                  checked={keylogCfg.enabled}
                  onChange={(e) => void saveKeylog({ ...keylogCfg, enabled: e.target.checked })}
                />
              </div>
              <div className="kv-row">
                <label>Path</label>
                <input
                  value={keylogCfg.path ?? ""}
                  placeholder="/var/log/keystroke.log"
                  onChange={(e) =>
                    void saveKeylog({ ...keylogCfg, path: e.target.value || null })
                  }
                />
                <button onClick={() => void pickPath()}>Browse…</button>
              </div>
              <div className="kv-row">
                <label>Format</label>
                <select
                  value={keylogCfg.format}
                  onChange={(e) =>
                    void saveKeylog({
                      ...keylogCfg,
                      format: e.target.value as KeylogConfig["format"],
                    })
                  }
                >
                  <option value="plain">plain</option>
                  <option value="jsonl">jsonl</option>
                  <option value="timestamped">timestamped</option>
                </select>
                <label>Discard unattributed</label>
                <input
                  type="checkbox"
                  checked={keylogCfg.discard_unattributed}
                  onChange={(e) =>
                    void saveKeylog({ ...keylogCfg, discard_unattributed: e.target.checked })
                  }
                />
              </div>
              <div className="kv-row">
                <label>Redaction patterns (one regex per line)</label>
                <textarea
                  value={keylogCfg.redaction_patterns.join("\n")}
                  onChange={(e) =>
                    void saveKeylog({
                      ...keylogCfg,
                      redaction_patterns: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={3}
                />
              </div>
              <div className="kv-row">
                <button onClick={() => void purge()}>Purge keylog data</button>
              </div>
            </>
          ) : (
            <div className="muted">loading…</div>
          )}
        </section>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
