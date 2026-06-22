import type { IntegrationSettings } from "@/types/surface";
import type { ModelIntentRefinement } from "@/types/model-intent";

const MIN_CONFIDENCE_FOR_ROUTING = 0.52;
const MAX_ROUTED_UTTERANCE_LENGTH = 700;

export function shouldAttemptModelRouting(settings: IntegrationSettings, isDesktopRuntime: boolean) {
  return (
    isDesktopRuntime &&
    settings.modelIntentRoutingEnabled &&
    settings.selectedModel.toLowerCase().includes("deepseek")
  );
}

export function selectRoutedUtterance(original: string, refinement: ModelIntentRefinement | null) {
  if (!refinement || refinement.status !== "used") {
    return original;
  }

  const routed = refinement.routedUtterance?.trim();
  if (!routed || routed.length > MAX_ROUTED_UTTERANCE_LENGTH) {
    return original;
  }

  if (refinement.confidence < MIN_CONFIDENCE_FOR_ROUTING) {
    return original;
  }

  return routed;
}
