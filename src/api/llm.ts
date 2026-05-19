import { cannedLlm, delay } from "./_stubs";

// [stub-data] No network calls; canned responses per template.

export type TemplateKind =
  | "morning_standup"
  | "ticket_summary"
  | "done_draft"
  | "end_of_day_journal"
  | "deferred_carry_comment"
  | "ad_hoc";

export type Provider = "openai" | "anthropic";

export interface LlmRequest {
  provider: Provider;
  model: string;
  template: TemplateKind;
  context: unknown;
  user_prompt?: string | null;
}

export interface LlmResponse {
  text: string;
}

export async function generate(req: LlmRequest): Promise<LlmResponse> {
  return delay(cannedLlm(req), 200);
}
