use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const DEFAULT_BASE_URL: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-v4-flash";
const MAX_TRANSCRIPT_CHARS: usize = 2_000;
const MAX_ROUTED_UTTERANCE_CHARS: usize = 700;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelIntentRefineRequest {
    transcript: String,
    local_intent_title: Option<String>,
    local_intent_kind: Option<String>,
    active_objective_kind: Option<String>,
    active_surface_kind: Option<String>,
    selected_model: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderStatus {
    provider: &'static str,
    model: String,
    base_url: String,
    configured: bool,
    status: &'static str,
    key_source: Option<String>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelIntentRefinement {
    status: &'static str,
    provider: &'static str,
    model: String,
    routed_utterance: Option<String>,
    objective_kind: String,
    route: String,
    confidence: f64,
    reason: String,
    latency_ms: Option<u128>,
    warnings: Vec<String>,
}

struct DeepSeekConfig {
    api_key: String,
    key_source: String,
    base_url: String,
    model: String,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct ProviderJson {
    #[serde(alias = "routedUtterance")]
    routed_utterance: Option<String>,
    #[serde(alias = "objectiveKind")]
    objective_kind: Option<String>,
    route: Option<String>,
    confidence: Option<f64>,
    reason: Option<String>,
    warnings: Option<Vec<String>>,
}

#[tauri::command]
pub fn load_model_provider_status() -> ModelProviderStatus {
    match load_config() {
        Some(config) => ModelProviderStatus {
            provider: DEFAULT_MODEL,
            model: config.model,
            base_url: config.base_url,
            configured: true,
            status: "ready",
            key_source: Some(config.key_source),
            message: "DeepSeek V4 Flash is configured for final voice intent routing.".to_string(),
        },
        None => ModelProviderStatus {
            provider: DEFAULT_MODEL,
            model: env_or_file_value("ADAPTIVE_SURFACE_DEEPSEEK_MODEL")
                .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            base_url: env_or_file_value("ADAPTIVE_SURFACE_DEEPSEEK_BASE_URL")
                .unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            configured: false,
            status: "not_configured",
            key_source: None,
            message: "DeepSeek key not configured. Adaptive Surface will use deterministic local routing.".to_string(),
        },
    }
}

#[tauri::command]
pub async fn refine_voice_intent_with_model(
    request: ModelIntentRefineRequest,
) -> Result<ModelIntentRefinement, String> {
    let started_at = Instant::now();
    let Some(config) = load_config() else {
        return Ok(fallback_refinement(
            "not_configured",
            DEFAULT_MODEL.to_string(),
            "DeepSeek key not configured. Used deterministic local routing.",
            Some(started_at.elapsed().as_millis()),
        ));
    };

    let transcript = request.transcript.trim();
    if transcript.is_empty() {
        return Ok(fallback_refinement(
            "invalid_response",
            config.model,
            "Empty transcript. Used deterministic local routing.",
            Some(started_at.elapsed().as_millis()),
        ));
    }

    let transcript = truncate_for_prompt(transcript, MAX_TRANSCRIPT_CHARS);
    let endpoint = chat_completions_url(&config.base_url);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(18))
        .build()
        .map_err(|_| "Failed to initialize DeepSeek client.".to_string())?;

    let response = client
        .post(endpoint)
        .bearer_auth(&config.api_key)
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": config.model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt(),
                },
                {
                    "role": "user",
                    "content": json!({
                        "transcript": transcript,
                        "localIntentTitle": request.local_intent_title,
                        "localIntentKind": request.local_intent_kind,
                        "activeObjectiveKind": request.active_objective_kind,
                        "activeSurfaceKind": request.active_surface_kind,
                        "selectedModel": request.selected_model,
                    }).to_string(),
                }
            ],
            "response_format": { "type": "json_object" },
            "thinking": { "type": "disabled" },
            "temperature": 0,
            "max_tokens": 420,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|_| "DeepSeek request failed before a response was returned.".to_string())?;

    if !response.status().is_success() {
        return Ok(fallback_refinement(
            "unavailable",
            DEFAULT_MODEL.to_string(),
            format!("DeepSeek returned HTTP {}. Used deterministic local routing.", response.status().as_u16()),
            Some(started_at.elapsed().as_millis()),
        ));
    }

    let completion = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|_| "DeepSeek response was not valid chat-completions JSON.".to_string())?;
    let Some(choice) = completion.choices.into_iter().next() else {
        return Ok(fallback_refinement(
            "invalid_response",
            DEFAULT_MODEL.to_string(),
            "DeepSeek returned no choices. Used deterministic local routing.",
            Some(started_at.elapsed().as_millis()),
        ));
    };

    if choice.finish_reason.as_deref() == Some("length") {
        return Ok(fallback_refinement(
            "invalid_response",
            DEFAULT_MODEL.to_string(),
            "DeepSeek JSON was truncated. Used deterministic local routing.",
            Some(started_at.elapsed().as_millis()),
        ));
    }

    let Some(content) = choice.message.content else {
        return Ok(fallback_refinement(
            "invalid_response",
            DEFAULT_MODEL.to_string(),
            "DeepSeek returned empty content. Used deterministic local routing.",
            Some(started_at.elapsed().as_millis()),
        ));
    };

    let parsed = serde_json::from_str::<ProviderJson>(&content).map_err(|_| {
        "DeepSeek content was not valid model-intent JSON.".to_string()
    })?;

    Ok(normalize_provider_json(
        parsed,
        DEFAULT_MODEL.to_string(),
        Some(started_at.elapsed().as_millis()),
    ))
}

fn system_prompt() -> &'static str {
    r#"You are Adaptive Surface's voice intent compiler. Return compact json only.

Your job is to normalize a spoken command into one safe deterministic routing utterance for the app.
Do not execute anything, do not claim anything was done, and do not output tool calls.
Preserve negations such as "do not send" and "don't approve".
If the user asks to send, create, export, delete, pay, schedule, or mutate anything, keep that approval-requiring intent visible in the routed utterance. Never bypass approval.
Do not add facts, recipients, dates, files, or local context that the transcript did not provide.

Allowed objectiveKind values:
draft_email, reply_to_email, summarize_email_or_thread, show_calendar, schedule_meeting, prepare_meeting, search_notes, summarize_notes, create_reminder, show_reminders, search_files, summarize_file, analyze_file_or_table, create_chart, catch_up, create_decision_brief, create_status_report, compare_options, quick_note, unknown.

Allowed route values:
continue_current_objective, refine_current_objective, add_supporting_context, create_new_objective, switch_to_previous_objective, complete_objective, request_approval, unknown.

Return this json shape:
{
  "routedUtterance": "one concise command in the user's language",
  "objectiveKind": "draft_email",
  "route": "create_new_objective",
  "confidence": 0.0,
  "reason": "short reason",
  "warnings": []
}"#
}

fn normalize_provider_json(
    parsed: ProviderJson,
    model: String,
    latency_ms: Option<u128>,
) -> ModelIntentRefinement {
    let routed = parsed
        .routed_utterance
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| truncate_for_prompt(&value, MAX_ROUTED_UTTERANCE_CHARS));
    let objective_kind = normalize_objective_kind(parsed.objective_kind.as_deref());
    let route = normalize_route(parsed.route.as_deref());
    let confidence = parsed.confidence.unwrap_or(0.0).clamp(0.0, 1.0);
    let reason = parsed
        .reason
        .map(|value| truncate_for_prompt(value.trim(), 240))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "DeepSeek returned a structured routing hint.".to_string());
    let warnings = parsed
        .warnings
        .unwrap_or_default()
        .into_iter()
        .map(|warning| truncate_for_prompt(warning.trim(), 180))
        .filter(|warning| !warning.is_empty())
        .take(4)
        .collect();

    ModelIntentRefinement {
        status: if routed.is_some() { "used" } else { "invalid_response" },
        provider: DEFAULT_MODEL,
        model,
        routed_utterance: routed,
        objective_kind,
        route,
        confidence,
        reason,
        latency_ms,
        warnings,
    }
}

fn fallback_refinement(
    status: &'static str,
    model: String,
    reason: impl Into<String>,
    latency_ms: Option<u128>,
) -> ModelIntentRefinement {
    ModelIntentRefinement {
        status,
        provider: DEFAULT_MODEL,
        model,
        routed_utterance: None,
        objective_kind: "unknown".to_string(),
        route: "unknown".to_string(),
        confidence: 0.0,
        reason: reason.into(),
        latency_ms,
        warnings: vec!["Fell back to deterministic local routing.".to_string()],
    }
}

fn normalize_objective_kind(value: Option<&str>) -> String {
    const ALLOWED: &[&str] = &[
        "draft_email",
        "reply_to_email",
        "summarize_email_or_thread",
        "show_calendar",
        "schedule_meeting",
        "prepare_meeting",
        "search_notes",
        "summarize_notes",
        "create_reminder",
        "show_reminders",
        "search_files",
        "summarize_file",
        "analyze_file_or_table",
        "create_chart",
        "catch_up",
        "create_decision_brief",
        "create_status_report",
        "compare_options",
        "quick_note",
        "unknown",
    ];
    normalize_allowed(value, ALLOWED)
}

fn normalize_route(value: Option<&str>) -> String {
    const ALLOWED: &[&str] = &[
        "continue_current_objective",
        "refine_current_objective",
        "add_supporting_context",
        "create_new_objective",
        "switch_to_previous_objective",
        "complete_objective",
        "request_approval",
        "unknown",
    ];
    normalize_allowed(value, ALLOWED)
}

fn normalize_allowed(value: Option<&str>, allowed: &[&str]) -> String {
    let normalized = value.unwrap_or("unknown").trim().to_ascii_lowercase();
    if allowed.iter().any(|candidate| *candidate == normalized) {
        normalized
    } else {
        "unknown".to_string()
    }
}

fn load_config() -> Option<DeepSeekConfig> {
    let api_key = env_or_file_value("ADAPTIVE_SURFACE_DEEPSEEK_API_KEY")
        .or_else(|| env_or_file_value("DEEPSEEK_API_KEY"))?;
    let key_source = if env::var("ADAPTIVE_SURFACE_DEEPSEEK_API_KEY").is_ok() {
        "ADAPTIVE_SURFACE_DEEPSEEK_API_KEY".to_string()
    } else if env::var("DEEPSEEK_API_KEY").is_ok() {
        "DEEPSEEK_API_KEY".to_string()
    } else {
        "local env file".to_string()
    };

    Some(DeepSeekConfig {
        api_key,
        key_source,
        base_url: env_or_file_value("ADAPTIVE_SURFACE_DEEPSEEK_BASE_URL")
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
        model: env_or_file_value("ADAPTIVE_SURFACE_DEEPSEEK_MODEL")
            .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
    })
}

fn env_or_file_value(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| env_file_value(name))
}

fn env_file_value(name: &str) -> Option<String> {
    for path in env_file_candidates() {
        let Ok(contents) = fs::read_to_string(path) else {
            continue;
        };
        if let Some(value) = parse_env_value(&contents, name) {
            return Some(value);
        }
    }

    None
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(".env.local"));
        candidates.push(current_dir.join(".env"));
        if let Some(parent) = current_dir.parent() {
            candidates.push(parent.join(".env.local"));
            candidates.push(parent.join(".env"));
        }
    }

    if let Ok(home) = env::var("HOME") {
        candidates.push(PathBuf::from(home).join("Library/Application Support/Adaptive Surface/.env"));
    }

    candidates
}

fn parse_env_value(contents: &str, name: &str) -> Option<String> {
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let trimmed = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if key.trim() != name {
            continue;
        }

        let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }

    None
}

fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn truncate_for_prompt(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_env_values_without_exposing_comments() {
        let contents = r#"
          # ignored
          export ADAPTIVE_SURFACE_DEEPSEEK_API_KEY="abc123"
        "#;

        assert_eq!(
            parse_env_value(contents, "ADAPTIVE_SURFACE_DEEPSEEK_API_KEY"),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn appends_chat_completions_to_base_url() {
        assert_eq!(
            chat_completions_url("https://api.deepseek.com"),
            "https://api.deepseek.com/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://gateway.example/v1/"),
            "https://gateway.example/v1/chat/completions"
        );
    }

    #[test]
    fn normalizes_unknown_provider_fields() {
        let result = normalize_provider_json(
            ProviderJson {
                routed_utterance: Some("show recent emails".to_string()),
                objective_kind: Some("not_real".to_string()),
                route: Some("also_fake".to_string()),
                confidence: Some(2.0),
                reason: Some("ok".to_string()),
                warnings: None,
            },
            DEFAULT_MODEL.to_string(),
            Some(10),
        );

        assert_eq!(result.objective_kind, "unknown");
        assert_eq!(result.route, "unknown");
        assert_eq!(result.confidence, 1.0);
    }
}
