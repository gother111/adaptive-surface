import type { IntentDetection } from "@/intent/types";

export interface OllamaIntentRequest {
  transcript: string;
  model?: string;
}

// Phase 1 intentionally uses the synchronous keyword classifier for latency.
// This helper is the future hook point for a local small model such as
// gemma2:2b, phi3:mini, or another Ollama model that refines the initial guess
// after the surface skeleton is already visible.
export async function refineIntentWithOllama(
  request: OllamaIntentRequest,
  signal?: AbortSignal,
): Promise<IntentDetection | null> {
  const model = request.model ?? "gemma2:2b";

  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: [
          "Classify this partial voice command into one Adaptive Surface intent.",
          "Return compact JSON only. Do not explain.",
          `Transcript: ${request.transcript}`,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      return null;
    }

    // TODO: validate the response with a schema before using it to patch state.
    return null;
  } catch {
    return null;
  }
}
