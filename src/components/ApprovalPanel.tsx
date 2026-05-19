import { useState } from "react";
import { useStore } from "../state/store";
import * as linear from "../api/linear";
import type { ApprovalProposal } from "../state/types";

/** Cursor-style propose / approve / edit / reject panel. Floats over the
 *  app while there are pending proposals; grouped by ticket. */
export function ApprovalPanel() {
  const approvals = useStore((s) => s.approvals);
  const removeApproval = useStore((s) => s.removeApproval);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = approvals.reduce<Record<string, ApprovalProposal[]>>((acc, p) => {
    (acc[p.ticketIdentifier] ||= []).push(p);
    return acc;
  }, {});

  const approve = async (p: ApprovalProposal) => {
    setBusyId(p.id);
    setError(null);
    try {
      if (p.kind === "comment") {
        const body = edits[p.id] ?? p.body ?? "";
        if (body.trim()) await linear.postComment(p.ticketId, body);
      } else if (p.kind === "transition" && p.stateId) {
        await linear.updateState(p.ticketId, p.stateId);
      }
      removeApproval(p.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async () => {
    for (const p of [...approvals]) {
      await approve(p);
    }
  };

  return (
    <div className="approval-panel">
      <div className="ap-header">
        <span>Pending Linear writes ({approvals.length})</span>
        <button onClick={() => void approveAll()}>Approve all</button>
      </div>
      {error && <div className="ap-error">{error}</div>}
      <div className="ap-body">
        {Object.entries(grouped).map(([ident, items]) => (
          <div key={ident} className="ap-group">
            <div className="ap-group-title">{ident}</div>
            {items.map((p) => (
              <div key={p.id} className={`ap-item kind-${p.kind} source-${p.source}`}>
                {p.kind === "comment" ? (
                  <>
                    <div className="ap-label">comment · {labelSource(p.source)}</div>
                    <textarea
                      value={edits[p.id] ?? p.body ?? ""}
                      onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })}
                      rows={4}
                    />
                  </>
                ) : (
                  <div className="ap-label">
                    transition → <strong>{p.stateName ?? p.stateId}</strong>
                  </div>
                )}
                <div className="ap-actions">
                  <button onClick={() => removeApproval(p.id)} disabled={busyId === p.id}>
                    Reject
                  </button>
                  <button
                    className="primary"
                    onClick={() => void approve(p)}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id ? "Posting…" : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function labelSource(s: ApprovalProposal["source"]): string {
  switch (s) {
    case "done":
      return "Done";
    case "end_day_touched":
      return "End-of-day progress";
    case "end_day_deferred":
      return "End-of-day carry";
    case "ad_hoc":
      return "Ad-hoc";
  }
}
