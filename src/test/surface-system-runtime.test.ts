import { describe, expect, it } from "vitest";
import { createMotionPlan } from "@/surface-system/motion";
import { validateSurfaceRecipe, type SurfaceNode, type SurfacePatch } from "@/surface-system/contracts";
import { adaptiveSurfaceSequenceFixtures, collectArtifactJourney } from "@/surface-system/fixtures";
import {
  createInitialPresentationState,
  reconcileSurfacePatch,
  shouldFreezeStructuralAdaptation,
} from "@/surface-system/reconciliation";

function testNode(id: string): SurfaceNode {
  return {
    id,
    kind: "evidence",
    semanticRole: "supporting evidence",
    artifactIds: [id],
    zoneHint: "context",
    priority: 10,
    disclosureLevel: 2,
    persistence: "session",
    placement: {
      minWidth: 200,
      minHeight: 120,
      canCollapse: true,
      canRelocate: true,
    },
    accessibility: {
      label: id,
      live: "off",
    },
  };
}

describe("surface system runtime", () => {
  it("validates deterministic recipes and rejects duplicate nodes", () => {
    for (const fixture of adaptiveSurfaceSequenceFixtures) {
      expect(validateSurfaceRecipe(fixture)).toEqual({ valid: true, errors: [] });
    }

    const invalid = {
      ...adaptiveSurfaceSequenceFixtures[0]!,
      nodes: [testNode("duplicate"), testNode("duplicate")],
    };
    expect(validateSurfaceRecipe(invalid).valid).toBe(false);
  });

  it("preserves source object identity across the representative sequence", () => {
    const journey = collectArtifactJourney("source:mail-thread");
    expect(journey.map((step) => step.archetype)).toEqual([
      "explorer",
      "matrix",
      "brief",
      "editor",
      "review",
    ]);
    expect(journey.every((step) => step.nodeIds.length > 0)).toBe(true);
  });

  it("defers relocation while protected interaction is active", () => {
    const recipe = {
      ...adaptiveSurfaceSequenceFixtures[0]!,
      revision: 7,
      nodes: [testNode("source:mail-thread")],
    };
    const patch: SurfacePatch = {
      sessionId: recipe.sessionId,
      baseRevision: 7,
      revision: 8,
      reason: "background result arrived",
      operations: [{ type: "moveNode", nodeId: "source:mail-thread", zoneHint: "inspector" }],
    };
    const presentation = createInitialPresentationState({
      focusedNodeId: "source:mail-thread",
      interactionState: "typing",
    });
    const result = reconcileSurfacePatch(recipe, patch, presentation);

    expect(shouldFreezeStructuralAdaptation(presentation)).toBe(true);
    expect(result.applied).toHaveLength(0);
    expect(result.deferred).toHaveLength(1);
    expect(result.recipe.nodes[0]?.zoneHint).toBe("context");
  });

  it("uses opacity and emphasis instead of travel for reduced motion plans", () => {
    const plan = createMotionPlan("stage-morph", { reducedMotion: true, distancePx: 900 });
    expect(plan.reduced).toBe(true);
    expect(plan.properties).not.toContain("transform");
    expect(plan.durationMs).toBeLessThanOrEqual(120);
  });
});
