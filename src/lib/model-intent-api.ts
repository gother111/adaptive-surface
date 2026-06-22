import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  ModelIntentRefineRequest,
  ModelIntentRefinement,
  ModelProviderStatus,
} from "@/types/model-intent";

export const defaultModelProviderStatus: ModelProviderStatus = {
  provider: "deepseek-v4-flash",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com",
  configured: false,
  status: "unavailable",
  keySource: null,
  message: "Model routing is available only inside the Tauri desktop runtime.",
};

export async function loadModelProviderStatus(): Promise<ModelProviderStatus> {
  if (!isTauriRuntime()) {
    return defaultModelProviderStatus;
  }

  return invoke<ModelProviderStatus>("load_model_provider_status");
}

export async function refineVoiceIntentWithModel(
  request: ModelIntentRefineRequest,
): Promise<ModelIntentRefinement> {
  if (!isTauriRuntime()) {
    return {
      status: "unavailable",
      provider: "deepseek-v4-flash",
      model: "deepseek-v4-flash",
      routedUtterance: null,
      objectiveKind: "unknown",
      route: "unknown",
      confidence: 0,
      reason: "Model routing is available only inside the Tauri desktop runtime.",
      latencyMs: null,
      warnings: ["Fell back to deterministic local routing."],
    };
  }

  return invoke<ModelIntentRefinement>("refine_voice_intent_with_model", { request });
}
