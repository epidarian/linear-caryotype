import { useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useStore, useCurrentTicket } from "../state/store";
import * as llm from "../api/llm";
import * as history from "../api/history";
import * as keylog from "../api/keylog";
import type { ApprovalProposal } from "../state/types";
import type { TemplateKind } from "../api/llm";

interface ActionDef {
  kind: TemplateKind;
  label: string;
  description: string;
}

const ACTIONS: ActionDef[] = [
  { kind: "morning_standup", label: "Morning standup", description: "Done / Doing / Blocked, references tickets." },
  { kind: "ticket_summary", label: "Ticket summary", description: "Summary of the current ticket." },
  { kind: "end_of_day_journal", label: "End-of-day journal", description: "Per-ticket recap of today." },
  { kind: "ad_hoc", label: "Ad-hoc", description: "Free-form prompt with current ticket context." },
];

export function LLMTray() {
  const trayOpen = useStore((s) => s.trayOpen);
  const setTrayOpen = useStore((s) => s.setTrayOpen);
  const settings = useStore((s) => s.settings);
  const stack = useStore((s) => s.stack);
  const addApproval = useStore((s) => s.addApproval);
  const cur = useCurrentTicket();
  const [active, setActive] = useState<TemplateKind>("morning_standup");
  const [output, setOutput] = useState<string>("");
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const actionDef = useMemo(
    () => ACTIONS.find((a) => a.kind === active) ?? ACTIONS[0],
    [active],
  );

  const generate = async () => {
    setBusy(true);
    setOutput("");
    try {
      const today = await history.today();
      let context: unknown = {};
      if (active === "morning_standup") {
        context = {
          yesterday: today,
          today_plan: stack.map((t) => ({
            id: t.issue.id,
            identifier: t.issue.identifier,
            title: t.issue.title,
          })),
          deferred_carryover: stack
            .filter((t) => t.deferred && !t.doneCommitted)
            .map((t) => ({ identifier: t.issue.identifier, title: t.issue.title })),
        };
      } else if (active === "ticket_summary") {
        if (!cur) {
          setOutput("(no current ticket)");
          setBusy(false);
          return;
        }
        const hist = await history.recentForTicket(cur.issue.id);
        const chunks = await keylog.chunksForTicket(cur.issue.id);
        context = {
          ticket: cur.issue,
          history: hist,
          keylog: chunks.map((c) => c.digest),
        };
      } else if (active === "end_of_day_journal") {
        context = {
          today,
          stack: stack.map((t) => ({
            identifier: t.issue.identifier,
            title: t.issue.title,
            spent_ms: t.spentMs,
            done: t.doneCommitted,
            deferred: t.deferred,
          })),
        };
      } else {
        context = {
          ticket: cur?.issue ?? null,
          today,
        };
      }
      const resp = await llm.generate({
        provider: settings.llmProvider,
        model: settings.llmModel,
        template: active,
        context,
        user_prompt: userPrompt || null,
      });
      setOutput(resp.text);
    } catch (e) {
      setOutput(`error: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (output) await writeText(output);
  };

  const proposeOnCurrent = () => {
    if (!cur || !output.trim()) return;
    const p: ApprovalProposal = {
      id: crypto.randomUUID(),
      kind: "comment",
      ticketId: cur.issue.id,
      ticketIdentifier: cur.issue.identifier,
      body: output,
      source: "ad_hoc",
    };
    addApproval(p);
  };

  if (!trayOpen) {
    return (
      <button className="tray-handle" onClick={() => setTrayOpen(true)} title="LLM tray">
        ⇣
      </button>
    );
  }

  return (
    <div className="tray">
      <div className="tray-header">
        <span>LLM tray</span>
        <button onClick={() => setTrayOpen(false)}>×</button>
      </div>
      <div className="tray-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            className={`tab ${active === a.kind ? "active" : ""}`}
            onClick={() => setActive(a.kind)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="tray-desc">{actionDef.description}</div>
      <input
        className="tray-input"
        placeholder="(optional) extra instruction"
        value={userPrompt}
        onChange={(e) => setUserPrompt(e.target.value)}
      />
      <div className="tray-controls">
        <button className="primary" disabled={busy} onClick={() => void generate()}>
          {busy ? "thinking…" : "Generate"}
        </button>
        <button disabled={!output} onClick={() => void copy()}>
          Copy
        </button>
        <button disabled={!output || !cur} onClick={proposeOnCurrent}>
          Propose comment on current
        </button>
      </div>
      <textarea
        className="tray-output"
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        rows={10}
      />
    </div>
  );
}
