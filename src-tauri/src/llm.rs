//! LLM client. Supports OpenAI and Anthropic. The frontend passes a
//! template kind plus structured context; we render a prompt server-side
//! so prompt strings stay out of the webview bundle (and we can iterate
//! without recompiling JS).

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::secrets::{self, KeyName};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Openai,
    Anthropic,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum TemplateKind {
    MorningStandup,
    TicketSummary,
    DoneDraft,
    EndOfDayJournal,
    DeferredCarryComment,
    AdHoc,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmRequest {
    pub provider: Provider,
    pub model: String,
    pub template: TemplateKind,
    /// Arbitrary structured context the template can reference.
    pub context: Value,
    /// Optional free-form user instruction (used by AdHoc, and appended to
    /// preset templates as additional steering).
    pub user_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmResponse {
    pub text: String,
}

fn system_prompt(kind: &TemplateKind) -> &'static str {
    match kind {
        TemplateKind::MorningStandup => {
            "You write concise daily standup posts. Output three sections: \
             Done, Doing, Blocked. Each line MUST start with a Linear ticket \
             identifier in square brackets (e.g. [LIN-123]) and be one sentence. \
             Use only the supplied context; do not invent tickets."
        }
        TemplateKind::TicketSummary => {
            "You summarize work on a single Linear ticket. Output one short \
             paragraph: what's been done, what's open, and a suggested next \
             step. Ground every claim in the supplied history and keylog \
             digest; do not invent details."
        }
        TemplateKind::DoneDraft => {
            "You draft a resolution comment for a Linear ticket the user just \
             completed. Output 2-4 short sentences: what was done, how it was \
             validated, and (optionally) any follow-ups. Plain markdown."
        }
        TemplateKind::EndOfDayJournal => {
            "You write an end-of-day journal grouped by ticket. For each \
             ticket, produce a header line with the ticket identifier and \
             title, then 1-3 bullet points describing what happened today. \
             Use only the supplied context."
        }
        TemplateKind::DeferredCarryComment => {
            "You draft a short Linear comment for a ticket that was planned \
             today but deferred. 1-2 sentences: acknowledge the slip, name \
             the most recent context, and state the intent to carry to the \
             next working day."
        }
        TemplateKind::AdHoc => {
            "You are a writing assistant for a software engineer. Follow the \
             user's instruction precisely using only the supplied context."
        }
    }
}

#[tauri::command]
pub async fn llm_generate(req: LlmRequest) -> Result<LlmResponse, String> {
    let sys = system_prompt(&req.template);
    let user = format!(
        "Context (JSON):\n{}\n\nInstruction: {}",
        serde_json::to_string_pretty(&req.context).unwrap_or_else(|_| "{}".into()),
        req.user_prompt.unwrap_or_else(|| "Follow the system prompt.".into())
    );
    match req.provider {
        Provider::Openai => openai(&req.model, sys, &user).await.map_err(|e| e.to_string()),
        Provider::Anthropic => anthropic(&req.model, sys, &user).await.map_err(|e| e.to_string()),
    }
}

async fn openai(model: &str, system: &str, user: &str) -> Result<LlmResponse> {
    let key = secrets::read(KeyName::Openai)
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("OpenAI API key not set"))?;
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0.4
    });
    let resp = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {key}"))
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    let text = resp
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(LlmResponse { text })
}

async fn anthropic(model: &str, system: &str, user: &str) -> Result<LlmResponse> {
    let key = secrets::read(KeyName::Anthropic)
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("Anthropic API key not set"))?;
    let body = json!({
        "model": model,
        "max_tokens": 1024,
        "system": system,
        "messages": [{ "role": "user", "content": user }]
    });
    let resp = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    let text = resp
        .pointer("/content/0/text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(LlmResponse { text })
}
