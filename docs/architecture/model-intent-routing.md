# Model Intent Routing

Adaptive Surface keeps partial voice handling local and immediate. The hosted
model is used only after a final utterance arrives, and only to normalize the
utterance into a deterministic routing hint.

## Provider

- Provider: DeepSeek V4 Flash.
- Default base URL: `https://api.deepseek.com`.
- Default model: `deepseek-v4-flash`.
- API shape: OpenAI-compatible `/chat/completions`.
- Response mode: JSON output with thinking disabled.

## Secret Handling

The React app does not receive the DeepSeek API key. The Tauri backend reads the
key from one of these sources:

- `ADAPTIVE_SURFACE_DEEPSEEK_API_KEY`
- `DEEPSEEK_API_KEY`
- an ignored `.env.local` or `.env` file near the app working directory
- `~/Library/Application Support/Adaptive Surface/.env`

Only non-secret provider status is returned to the frontend.

## Routing Boundary

The model returns a compact JSON object with a routed utterance, objective kind,
route, confidence, reason, and warnings. That output does not execute actions.
Existing local objective routing, workspace routing, capability policy, and
approval gates still decide what the app may do.

If the provider is missing, unavailable, low-confidence, or returns invalid
JSON, Adaptive Surface falls back to deterministic local routing.

## Privacy Boundary

This first integration sends only the final voice transcript plus lightweight
surface/objective labels. It does not send Mail, Calendar, Notes, reminders,
file contents, local search results, or trusted-root data to DeepSeek.
