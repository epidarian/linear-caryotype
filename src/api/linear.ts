import { invoke } from "@tauri-apps/api/core";
import type { LinearIssue, LinearWorkflowState } from "../state/types";
import { isTauri } from "./settings";
import { STUB_ISSUES, STUB_WORKFLOW_STATES, delay } from "./_stubs";

export async function fetchToday(label?: string | null): Promise<LinearIssue[]> {
  if (isTauri()) {
    return invoke<LinearIssue[]>("linear_fetch_today", { label: label ?? null });
  }
  let out = STUB_ISSUES;
  if (label) out = out.filter((i) => i.labels.includes(label));
  return delay(out);
}

export async function fetchIssue(id: string): Promise<LinearIssue> {
  if (isTauri()) {
    return invoke<LinearIssue>("linear_fetch_issue", { id });
  }
  return delay(STUB_ISSUES.find((i) => i.id === id) ?? STUB_ISSUES[0]);
}

export async function postComment(issueId: string, body: string): Promise<void> {
  if (isTauri()) {
    return invoke("linear_post_comment", { issueId, body });
  }
  console.info("[stub] linear.postComment", { issueId, body });
  return delay(undefined);
}

export async function updateState(issueId: string, stateId: string): Promise<void> {
  if (isTauri()) {
    return invoke("linear_update_state", { issueId, stateId });
  }
  console.info("[stub] linear.updateState", { issueId, stateId });
  return delay(undefined);
}

export async function workflowStates(teamKey: string): Promise<LinearWorkflowState[]> {
  if (isTauri()) {
    return invoke<LinearWorkflowState[]>("linear_workflow_states", { teamKey });
  }
  return delay(STUB_WORKFLOW_STATES);
}
