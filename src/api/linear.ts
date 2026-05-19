import type { LinearIssue, LinearWorkflowState } from "../state/types";
import { STUB_ISSUES, STUB_WORKFLOW_STATES, delay } from "./_stubs";

// [stub-data] All Linear writes are no-ops; reads return the canned set.

export async function fetchToday(label?: string | null): Promise<LinearIssue[]> {
  let out = STUB_ISSUES;
  if (label) out = out.filter((i) => i.labels.includes(label));
  return delay(out);
}

export async function fetchIssue(id: string): Promise<LinearIssue> {
  const found = STUB_ISSUES.find((i) => i.id === id) ?? STUB_ISSUES[0];
  return delay(found);
}

export async function postComment(issueId: string, body: string): Promise<void> {
  console.info("[stub] linear.postComment", { issueId, body });
  return delay(undefined);
}

export async function updateState(issueId: string, stateId: string): Promise<void> {
  console.info("[stub] linear.updateState", { issueId, stateId });
  return delay(undefined);
}

export async function workflowStates(teamKey: string): Promise<LinearWorkflowState[]> {
  void teamKey;
  return delay(STUB_WORKFLOW_STATES);
}
