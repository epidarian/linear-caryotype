import { useEffect, useState } from "react";
import { useStore, useCurrentTicket } from "../state/store";
import * as llm from "../api/llm";
import * as history from "../api/history";
import * as keylog from "../api/keylog";
import * as linear from "../api/linear";
import type { ApprovalProposal, LinearWorkflowState } from "../state/types";

/** Two-step Done landing screen. Pauses the timer (already done by
 *  `pressDone`), surfaces a draft Linear comment + a state transition
 *  picker, and lets the user Approve (queues into approvals), Edit, or
 *  Reject. Pressing Done again (or the Next button) commits and advances. */
export function DoneScreen() {
  const cur = useCurrentTicket();
  const settings = useStore((s) => s.settings);
  const addApproval = useStore((s) => s.addApproval);
  const commitDone = useStore((s) => s.commitDone);
  const cancelDonePending = useStore((s) => s.cancelDonePending);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [transition, setTransition] = useState<string>("");
  const [states, setStates] = useState<LinearWorkflowState[]>([]);

  useEffect(() => {
    if (!cur) return;
    void (async () => {
      try {
        const hist = await history.recentForTicket(cur.issue.id, 50);
        const chunks = await keylog.chunksForTicket(cur.issue.id);
        setLoading(true);
        const resp = await llm.generate({
          provider: settings.llmProvider,
          model: settings.llmModel,
          template: "done_draft",
          context: {
            ticket: cur.issue,
            history: hist,
            keylog: chunks.map((c) => c.digest),
          },
        });
        setDraft(resp.text);
      } catch (e) {
        setDraft(`(LLM unavailable: ${e})`);
      } finally {
        setLoading(false);
      }
      if (cur.issue.team_key) {
        try {
          const ws = await linear.workflowStates(cur.issue.team_key);
          setStates(ws);
          const done = ws.find((w) => w.type === "completed");
          if (done) setTransition(done.id);
        } catch {
          /* leave empty */
        }
      }
    })();
  }, [cur?.issue.id, settings.llmProvider, settings.llmModel]);

  if (!cur) return null;

  const queueApprovals = () => {
    if (!cur) return;
    if (draft.trim()) {
      const p: ApprovalProposal = {
        id: crypto.randomUUID(),
        kind: "comment",
        ticketId: cur.issue.id,
        ticketIdentifier: cur.issue.identifier,
        body: draft,
        source: "done",
      };
      addApproval(p);
    }
    if (transition) {
      const w = states.find((s) => s.id === transition);
      const p: ApprovalProposal = {
        id: crypto.randomUUID(),
        kind: "transition",
        ticketId: cur.issue.id,
        ticketIdentifier: cur.issue.identifier,
        stateId: transition,
        stateName: w?.name ?? transition,
        source: "done",
      };
      addApproval(p);
    }
  };

  return (
    <div className="done-screen">
      <div className="ds-header">
        <div>
          <div className="ticket-id">{cur.issue.identifier}</div>
          <div className="ticket-title">{cur.issue.title}</div>
        </div>
        <div className="ds-status">Done pending</div>
      </div>

      <label className="ds-label">Suggested Linear comment</label>
      <textarea
        className="ds-textarea"
        value={loading ? "drafting…" : draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
      />

      <div className="ds-transition">
        <label>
          Transition state to:&nbsp;
          <select value={transition} onChange={(e) => setTransition(e.target.value)}>
            <option value="">(leave unchanged)</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ds-actions">
        <button onClick={cancelDonePending}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            queueApprovals();
          }}
        >
          Queue for approval
        </button>
        <button
          className="primary done"
          onClick={() => {
            queueApprovals();
            void commitDone();
          }}
          title="Next ticket"
        >
          Commit &amp; Next
        </button>
      </div>
    </div>
  );
}
