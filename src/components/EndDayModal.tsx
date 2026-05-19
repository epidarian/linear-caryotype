import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import * as llm from "../api/llm";
import * as history from "../api/history";
import * as keylog from "../api/keylog";
import type { ApprovalProposal } from "../state/types";

interface Props {
  onClose: () => void;
}

export function EndDayModal({ onClose }: Props) {
  const stack = useStore((s) => s.stack);
  const endDay = useStore((s) => s.endDay);
  const addApproval = useStore((s) => s.addApproval);
  const settings = useStore((s) => s.settings);
  const [building, setBuilding] = useState(false);
  const [journal, setJournal] = useState<string>("");

  const touched = useMemo(
    () => stack.filter((t) => t.spentMs > 0 || t.doneCommitted),
    [stack],
  );
  const deferred = useMemo(
    () => stack.filter((t) => !t.doneCommitted && (t.deferred || t.skippedToBack)),
    [stack],
  );

  useEffect(() => {
    void (async () => {
      try {
        setBuilding(true);
        const today = await history.today();
        const resp = await llm.generate({
          provider: settings.llmProvider,
          model: settings.llmModel,
          template: "end_of_day_journal",
          context: {
            today,
            touched: touched.map((t) => ({
              id: t.issue.id,
              identifier: t.issue.identifier,
              title: t.issue.title,
              spent_ms: t.spentMs,
              done: t.doneCommitted,
            })),
            deferred: deferred.map((t) => ({
              id: t.issue.id,
              identifier: t.issue.identifier,
              title: t.issue.title,
              reason: t.skippedToBack ? "skipped" : "reflow",
            })),
          },
        });
        setJournal(resp.text);
      } catch (e) {
        setJournal(`(journal unavailable: ${e})`);
      } finally {
        setBuilding(false);
      }
    })();
  }, []);

  const confirm = async () => {
    await endDay();
    // Queue per-ticket approvals.
    for (const t of touched) {
      try {
        const hist = await history.recentForTicket(t.issue.id, 50);
        const chunks = await keylog.chunksForTicket(t.issue.id);
        const resp = await llm.generate({
          provider: settings.llmProvider,
          model: settings.llmModel,
          template: "ticket_summary",
          context: { ticket: t.issue, history: hist, keylog: chunks.map((c) => c.digest) },
        });
        const p: ApprovalProposal = {
          id: crypto.randomUUID(),
          kind: "comment",
          ticketId: t.issue.id,
          ticketIdentifier: t.issue.identifier,
          body: resp.text,
          source: "end_day_touched",
        };
        addApproval(p);
      } catch {
        /* skip on failure */
      }
    }
    for (const t of deferred) {
      try {
        const hist = await history.recentForTicket(t.issue.id, 20);
        const resp = await llm.generate({
          provider: settings.llmProvider,
          model: settings.llmModel,
          template: "deferred_carry_comment",
          context: {
            ticket: t.issue,
            history: hist,
            reason: t.skippedToBack ? "skipped" : "deferred by reflow",
          },
        });
        const p: ApprovalProposal = {
          id: crypto.randomUUID(),
          kind: "comment",
          ticketId: t.issue.id,
          ticketIdentifier: t.issue.identifier,
          body: resp.text,
          source: "end_day_deferred",
        };
        addApproval(p);
      } catch {
        /* skip on failure */
      }
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>End the day now?</h3>
        <p>
          {touched.length} touched · {deferred.length} deferred. After confirming,
          per-ticket comments will be drafted and queued for your approval
          before they are posted to Linear.
        </p>
        <details>
          <summary>Day journal preview {building ? "(building…)" : ""}</summary>
          <pre className="journal">{journal}</pre>
        </details>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void confirm()}>
            End day
          </button>
        </div>
      </div>
    </div>
  );
}
