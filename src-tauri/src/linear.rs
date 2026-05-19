//! Linear GraphQL client. Reads issues for the current viewer; writes are
//! routed through the approval flow on the frontend, then call the
//! `linear_post_comment` / `linear_update_state` commands here.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::secrets::{self, KeyName};

const LINEAR_API: &str = "https://api.linear.app/graphql";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub priority: f64,
    pub state_name: String,
    pub state_type: String,
    pub estimate: Option<f64>,
    pub team_key: Option<String>,
    pub assignee_id: Option<String>,
    pub labels: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinearWorkflowState {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub state_type: String,
}

async fn gql(query: &str, variables: Value) -> Result<Value> {
    let key = secrets::read(KeyName::Linear)
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("Linear API key not set"))?;
    let client = reqwest::Client::new();
    let body = json!({ "query": query, "variables": variables });
    let resp = client
        .post(LINEAR_API)
        .header("Authorization", key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    if let Some(errors) = resp.get("errors") {
        return Err(anyhow!("Linear errors: {errors}"));
    }
    Ok(resp.get("data").cloned().unwrap_or(Value::Null))
}

/// Fetch the day's candidate tickets. Filter is configurable from the
/// frontend; defaults to issues assigned to the viewer in non-completed,
/// non-cancelled states.
#[tauri::command]
pub async fn linear_fetch_today(label: Option<String>) -> Result<Vec<LinearIssue>, String> {
    let query = r#"
      query Today($filter: IssueFilter) {
        viewer { id }
        issues(filter: $filter, first: 100, orderBy: updatedAt) {
          nodes {
            id identifier title url priority estimate
            state { name type }
            team { key }
            assignee { id }
            labels { nodes { name } }
          }
        }
      }
    "#;

    let mut filter = json!({
      "assignee": { "isMe": { "eq": true } },
      "state": { "type": { "nin": ["completed", "canceled"] } }
    });
    if let Some(lbl) = label {
        filter["labels"] = json!({ "some": { "name": { "eq": lbl } } });
    }

    let data = gql(query, json!({ "filter": filter }))
        .await
        .map_err(|e| e.to_string())?;
    let nodes = data
        .pointer("/issues/nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let issues = nodes
        .into_iter()
        .map(|n| LinearIssue {
            id: n.pointer("/id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            identifier: n
                .pointer("/identifier")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            title: n.pointer("/title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            url: n.pointer("/url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            priority: n.pointer("/priority").and_then(|v| v.as_f64()).unwrap_or(0.0),
            state_name: n
                .pointer("/state/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            state_type: n
                .pointer("/state/type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            estimate: n.pointer("/estimate").and_then(|v| v.as_f64()),
            team_key: n
                .pointer("/team/key")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            assignee_id: n
                .pointer("/assignee/id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            labels: n
                .pointer("/labels/nodes")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|l| l.pointer("/name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .collect(),
        })
        .collect();
    Ok(issues)
}

#[tauri::command]
pub async fn linear_fetch_issue(id: String) -> Result<LinearIssue, String> {
    let query = r#"
      query Issue($id: String!) {
        issue(id: $id) {
          id identifier title url priority estimate
          state { name type }
          team { key }
          assignee { id }
          labels { nodes { name } }
        }
      }
    "#;
    let data = gql(query, json!({ "id": id })).await.map_err(|e| e.to_string())?;
    let n = data.pointer("/issue").cloned().unwrap_or(Value::Null);
    Ok(LinearIssue {
        id: n.pointer("/id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        identifier: n
            .pointer("/identifier")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: n.pointer("/title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        url: n.pointer("/url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        priority: n.pointer("/priority").and_then(|v| v.as_f64()).unwrap_or(0.0),
        state_name: n
            .pointer("/state/name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        state_type: n
            .pointer("/state/type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        estimate: n.pointer("/estimate").and_then(|v| v.as_f64()),
        team_key: n
            .pointer("/team/key")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        assignee_id: n
            .pointer("/assignee/id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        labels: n
            .pointer("/labels/nodes")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|l| l.pointer("/name").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect(),
    })
}

/// Post a comment on a Linear issue. The frontend must always confirm
/// (Approve / Edit / Reject) before this is called.
#[tauri::command]
pub async fn linear_post_comment(issue_id: String, body: String) -> Result<(), String> {
    let mutation = r#"
      mutation Comment($input: CommentCreateInput!) {
        commentCreate(input: $input) { success comment { id } }
      }
    "#;
    let input = json!({ "issueId": issue_id, "body": body });
    let data = gql(mutation, json!({ "input": input }))
        .await
        .map_err(|e| e.to_string())?;
    if data
        .pointer("/commentCreate/success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(format!("commentCreate did not succeed: {data}"))
    }
}

/// Transition an issue's state. Only called after explicit user opt-in
/// (Done screen checkbox).
#[tauri::command]
pub async fn linear_update_state(issue_id: String, state_id: String) -> Result<(), String> {
    let mutation = r#"
      mutation Update($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }
    "#;
    let data = gql(
        mutation,
        json!({ "id": issue_id, "input": { "stateId": state_id } }),
    )
    .await
    .map_err(|e| e.to_string())?;
    if data
        .pointer("/issueUpdate/success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(format!("issueUpdate did not succeed: {data}"))
    }
}

/// Workflow states for a team (used to populate the "transition to Done"
/// option on the Done screen).
#[tauri::command]
pub async fn linear_workflow_states(team_key: String) -> Result<Vec<LinearWorkflowState>, String> {
    let query = r#"
      query States($key: String!) {
        workflowStates(filter: { team: { key: { eq: $key } } }, first: 50) {
          nodes { id name type }
        }
      }
    "#;
    let data = gql(query, json!({ "key": team_key }))
        .await
        .map_err(|e| e.to_string())?;
    let nodes = data
        .pointer("/workflowStates/nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(nodes
        .into_iter()
        .filter_map(|n| {
            Some(LinearWorkflowState {
                id: n.pointer("/id").and_then(|v| v.as_str())?.to_string(),
                name: n.pointer("/name").and_then(|v| v.as_str())?.to_string(),
                state_type: n.pointer("/type").and_then(|v| v.as_str())?.to_string(),
            })
        })
        .collect())
}
