import { describe, expect, it } from "vitest";
import { selectRoutedUtterance, shouldAttemptModelRouting } from "@/model-intent/model-intent-routing";
import type { IntegrationSettings } from "@/types/surface";
import type { ModelIntentRefinement } from "@/types/model-intent";

const baseSettings: IntegrationSettings = {
  appleScriptEnabled: false,
  accessibilityEnabled: false,
  localBackendUrl: "http://127.0.0.1:8000",
  selectedModel: "deepseek-v4-flash",
  modelIntentRoutingEnabled: true,
  voiceMode: "continuous",
  trustedFileRoots: [],
  personalFileIndexPath: "",
  contextSources: [],
};

describe("model intent routing", () => {
  it("only attempts hosted routing for the DeepSeek model inside the desktop runtime", () => {
    expect(shouldAttemptModelRouting(baseSettings, true)).toBe(true);
    expect(shouldAttemptModelRouting(baseSettings, false)).toBe(false);
    expect(shouldAttemptModelRouting({ ...baseSettings, selectedModel: "local-router/default" }, true)).toBe(false);
    expect(shouldAttemptModelRouting({ ...baseSettings, modelIntentRoutingEnabled: false }, true)).toBe(false);
  });

  it("uses high-confidence model routing hints", () => {
    expect(selectRoutedUtterance("pull up my inbox", refinement({ routedUtterance: "show recent emails" }))).toBe("show recent emails");
  });

  it("falls back when the model is not used or returns low confidence", () => {
    expect(selectRoutedUtterance("pull up my inbox", null)).toBe("pull up my inbox");
    expect(selectRoutedUtterance("pull up my inbox", refinement({ status: "not_configured" }))).toBe("pull up my inbox");
    expect(selectRoutedUtterance("pull up my inbox", refinement({ confidence: 0.4 }))).toBe("pull up my inbox");
  });
});

function refinement(overrides: Partial<ModelIntentRefinement>): ModelIntentRefinement {
  return {
    status: "used",
    provider: "deepseek-v4-flash",
    model: "deepseek-v4-flash",
    routedUtterance: "show recent emails",
    objectiveKind: "summarize_email_or_thread",
    route: "create_new_objective",
    confidence: 0.9,
    reason: "Normalized a casual inbox request.",
    latencyMs: 250,
    warnings: [],
    ...overrides,
  };
}
