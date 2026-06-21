export type SurfaceMode = "ambient" | "peek" | "focus" | "commit" | "resume";

export type SurfaceZone =
  | "continuity"
  | "context"
  | "stage"
  | "inspector"
  | "interaction";

export type SurfaceArchetype =
  | "brief"
  | "matrix"
  | "canvas"
  | "board"
  | "timeline"
  | "editor"
  | "review"
  | "explorer"
  | "dashboard"
  | "execution";

export type DisclosureLevel = 0 | 1 | 2 | 3;

export interface SurfaceNode {
  id: string;
  kind: string;
  semanticRole: string;
  artifactIds: string[];
  zoneHint: SurfaceZone;
  priority: number;
  disclosureLevel: DisclosureLevel;
  persistence: "ephemeral" | "session" | "pinned" | "required";
  placement: {
    minWidth: number;
    minHeight: number;
    preferredAspect?: number;
    canCollapse: boolean;
    canRelocate: boolean;
  };
  accessibility: {
    label: string;
    description?: string;
    live?: "off" | "polite" | "assertive";
  };
}

export interface SurfaceRecipe {
  sessionId: string;
  recipeId: string;
  revision: number;
  mode: SurfaceMode;
  archetype: SurfaceArchetype;
  nodes: SurfaceNode[];
  primaryActionId?: string;
  transitionReason?: string;
}

export type SurfacePatchOperation =
  | {
      type: "upsertNode";
      node: SurfaceNode;
    }
  | {
      type: "updateNode";
      nodeId: string;
      changes: Partial<Pick<SurfaceNode, "semanticRole" | "priority" | "disclosureLevel" | "accessibility">>;
    }
  | {
      type: "setDisclosure";
      nodeId: string;
      disclosureLevel: DisclosureLevel;
    }
  | {
      type: "moveNode";
      nodeId: string;
      zoneHint: SurfaceZone;
    }
  | {
      type: "collapseNode";
      nodeId: string;
      reason: string;
    }
  | {
      type: "removeNode";
      nodeId: string;
      reason: string;
    };

export interface SurfacePatch {
  sessionId: string;
  baseRevision: number;
  revision: number;
  operations: SurfacePatchOperation[];
  reason: string;
}

export interface SurfaceValidationResult {
  valid: boolean;
  errors: string[];
}

const modes: SurfaceMode[] = ["ambient", "peek", "focus", "commit", "resume"];
const zones: SurfaceZone[] = ["continuity", "context", "stage", "inspector", "interaction"];
const archetypes: SurfaceArchetype[] = [
  "brief",
  "matrix",
  "canvas",
  "board",
  "timeline",
  "editor",
  "review",
  "explorer",
  "dashboard",
  "execution",
];

export function validateSurfaceRecipe(recipe: SurfaceRecipe): SurfaceValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (!recipe.sessionId.trim()) errors.push("sessionId is required");
  if (!recipe.recipeId.trim()) errors.push("recipeId is required");
  if (!Number.isInteger(recipe.revision) || recipe.revision < 0) errors.push("revision must be a non-negative integer");
  if (!modes.includes(recipe.mode)) errors.push(`unknown mode: ${recipe.mode}`);
  if (!archetypes.includes(recipe.archetype)) errors.push(`unknown archetype: ${recipe.archetype}`);

  for (const node of recipe.nodes) {
    if (!node.id.trim()) errors.push("node id is required");
    if (seenIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    seenIds.add(node.id);
    if (!zones.includes(node.zoneHint)) errors.push(`node ${node.id} has unknown zone ${node.zoneHint}`);
    if (node.disclosureLevel < 0 || node.disclosureLevel > 3) {
      errors.push(`node ${node.id} has invalid disclosure level`);
    }
    if (node.placement.minWidth < 0 || node.placement.minHeight < 0) {
      errors.push(`node ${node.id} has invalid minimum geometry`);
    }
    if (!node.accessibility.label.trim()) {
      errors.push(`node ${node.id} requires an accessibility label`);
    }
  }

  if (recipe.primaryActionId && !seenIds.has(recipe.primaryActionId)) {
    errors.push(`primaryActionId does not match a node: ${recipe.primaryActionId}`);
  }

  return { valid: errors.length === 0, errors };
}
