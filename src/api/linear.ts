import { invoke } from "@tauri-apps/api/core";
import type { LinearIssue, LinearWorkflowState } from "../state/types";

export async function fetchToday(label?: string | null): Promise<LinearIssue[]> {
  return invoke<LinearIssue[]>("linear_fetch_today", { label: label ?? null });
}

export async function fetchIssue(id: string): Promise<LinearIssue> {
  return invoke<LinearIssue>("linear_fetch_issue", { id });
}

export async function postComment(issueId: string, body: string): Promise<void> {
  return invoke("linear_post_comment", { issueId, body });
}

export async function updateState(issueId: string, stateId: string): Promise<void> {
  return invoke("linear_update_state", { issueId, stateId });
}

export async function workflowStates(teamKey: string): Promise<LinearWorkflowState[]> {
  return invoke<LinearWorkflowState[]>("linear_workflow_states", { teamKey });
}
