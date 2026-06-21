import type { SurfaceArchetype, SurfaceNode, SurfaceRecipe } from "@/surface-system/contracts";

const sessionId = "fixture:adaptive-surface-sequence";

function node(
  id: string,
  archetype: SurfaceArchetype,
  zoneHint: SurfaceNode["zoneHint"],
  artifactIds: string[],
  priority: number,
): SurfaceNode {
  return {
    id,
    kind: archetype,
    semanticRole: `${archetype} ${zoneHint}`,
    artifactIds,
    zoneHint,
    priority,
    disclosureLevel: zoneHint === "stage" ? 1 : 2,
    persistence: zoneHint === "stage" ? "session" : "required",
    placement: {
      minWidth: zoneHint === "stage" ? 520 : 220,
      minHeight: zoneHint === "stage" ? 360 : 160,
      preferredAspect: zoneHint === "stage" ? 1.35 : undefined,
      canCollapse: zoneHint !== "stage",
      canRelocate: zoneHint !== "continuity" && zoneHint !== "interaction",
    },
    accessibility: {
      label: `${archetype} ${id}`,
      live: zoneHint === "stage" ? "polite" : "off",
    },
  };
}

function recipe(
  revision: number,
  archetype: SurfaceArchetype,
  nodes: SurfaceNode[],
  primaryActionId?: string,
): SurfaceRecipe {
  return {
    sessionId,
    recipeId: `fixture:${archetype}:${revision}`,
    revision,
    mode: archetype === "review" ? "commit" : "focus",
    archetype,
    nodes,
    primaryActionId,
    transitionReason: "deterministic adaptive-surface fixture",
  };
}

export const adaptiveSurfaceSequenceFixtures: SurfaceRecipe[] = [
  recipe(1, "explorer", [
    node("source:mail-thread", "explorer", "context", ["source:mail-thread"], 80),
    node("source:calendar-window", "explorer", "context", ["source:calendar-window"], 70),
    node("artifact:research-workspace", "explorer", "stage", ["source:mail-thread", "source:calendar-window"], 100),
    node("inspector:why-visible", "explorer", "inspector", ["source:mail-thread"], 50),
  ]),
  recipe(2, "matrix", [
    node("source:mail-thread", "matrix", "context", ["source:mail-thread"], 80),
    node("source:calendar-window", "matrix", "context", ["source:calendar-window"], 70),
    node("artifact:comparison", "matrix", "stage", ["source:mail-thread", "source:calendar-window"], 100),
    node("inspector:criteria", "matrix", "inspector", ["source:mail-thread"], 60),
  ]),
  recipe(3, "brief", [
    node("source:mail-thread", "brief", "context", ["source:mail-thread"], 80),
    node("artifact:comparison", "brief", "context", ["source:mail-thread", "source:calendar-window"], 70),
    node("artifact:decision-brief", "brief", "stage", ["source:mail-thread", "source:calendar-window"], 100),
    node("inspector:assumptions", "brief", "inspector", ["source:calendar-window"], 60),
  ]),
  recipe(4, "editor", [
    node("artifact:decision-brief", "editor", "context", ["source:mail-thread", "source:calendar-window"], 80),
    node("artifact:message-draft", "editor", "stage", ["source:mail-thread", "source:calendar-window"], 100),
    node("inspector:recipient-scope", "editor", "inspector", ["source:mail-thread"], 70),
  ]),
  recipe(5, "review", [
    node("artifact:message-draft", "review", "context", ["source:mail-thread"], 80),
    node("commit:review-send", "review", "stage", ["source:mail-thread", "source:calendar-window"], 100),
    node("inspector:risk-reversibility", "review", "inspector", ["source:mail-thread"], 95),
  ], "commit:review-send"),
];

export function collectArtifactJourney(artifactId: string) {
  return adaptiveSurfaceSequenceFixtures.map((fixture) => ({
    revision: fixture.revision,
    archetype: fixture.archetype,
    nodeIds: fixture.nodes
      .filter((nodeItem) => nodeItem.artifactIds.includes(artifactId) || nodeItem.id === artifactId)
      .map((nodeItem) => nodeItem.id),
  }));
}
