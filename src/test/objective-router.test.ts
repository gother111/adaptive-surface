import { describe, expect, it } from "vitest";
import { applyObjectiveRouting } from "@/objectives/objective-reducer";
import { getActiveObjective } from "@/objectives/objective-memory";
import { routeUtteranceToObjectiveFrame } from "@/objectives/objective-router";
import type { ObjectiveFrame } from "@/objectives/objective-types";

function routeSequence(utterances: string[]) {
  let objectives: ObjectiveFrame[] = [];
  let activeObjectiveId: string | null = null;
  const decisions = [];

  for (const utterance of utterances) {
    const decision = routeUtteranceToObjectiveFrame(utterance, getActiveObjective(objectives, activeObjectiveId), objectives);
    const update = applyObjectiveRouting(objectives, activeObjectiveId, decision, utterance);
    objectives = update.objectives;
    activeObjectiveId = update.activeObjectiveId;
    decisions.push(decision);
  }

  return { objectives, activeObjective: getActiveObjective(objectives, activeObjectiveId), decisions };
}

describe("objective router", () => {
  it("creates an email draft objective", () => {
    const { activeObjective } = routeSequence(["Write an email to Jacob."]);
    expect(activeObjective?.kind).toBe("draft_email");
  });

  it("continues the same email objective", () => {
    const { objectives, activeObjective, decisions } = routeSequence([
      "Write an email to Jacob.",
      "Also mention that I watched his talk.",
    ]);
    expect(objectives).toHaveLength(1);
    expect(activeObjective?.kind).toBe("draft_email");
    expect(decisions[1].route).toBe("continue_current_objective");
  });

  it("refines the current email objective", () => {
    const { objectives, decisions } = routeSequence(["Write an email to Jacob.", "Make it shorter."]);
    expect(objectives).toHaveLength(1);
    expect(decisions[1].route).toBe("refine_current_objective");
  });

  it("adds calendar as supporting context for an active email", () => {
    const { activeObjective, decisions } = routeSequence([
      "Write an email to Jacob.",
      "Show my calendar.",
    ]);
    expect(activeObjective?.kind).toBe("draft_email");
    expect(decisions[1].route).toBe("add_supporting_context");
  });

  it("switches back to a previous email objective", () => {
    const { activeObjective, decisions } = routeSequence([
      "Write an email to Jacob.",
      "Open calendar instead.",
      "Go back to the email.",
    ]);
    expect(activeObjective?.kind).toBe("draft_email");
    expect(decisions[2].route).toBe("switch_to_previous_objective");
  });

  it("closes the active objective", () => {
    const { activeObjective, decisions } = routeSequence(["Write an email to Jacob.", "Close this."]);
    expect(activeObjective).toBeNull();
    expect(decisions[1].route).toBe("complete_objective");
  });
});
