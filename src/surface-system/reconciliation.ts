import type {
  SurfaceNode,
  SurfacePatch,
  SurfacePatchOperation,
  SurfaceRecipe,
} from "@/surface-system/contracts";

export type InteractionState =
  | "idle"
  | "typing"
  | "dictating"
  | "dragging"
  | "resizing"
  | "selecting"
  | "reading-change"
  | "commit-control";

export type AdaptationClass =
  | "content"
  | "emphasis"
  | "disclosure"
  | "insertion"
  | "relocation"
  | "surface-transition"
  | "removal";

export interface PresentationState {
  focusedNodeId: string | null;
  selectedNodeIds: string[];
  pinnedNodeIds: string[];
  manuallySizedNodeIds: string[];
  interactionState: InteractionState;
  scrollByNodeId: Record<string, number>;
}

export interface ReconciliationResult {
  recipe: SurfaceRecipe;
  applied: SurfacePatchOperation[];
  deferred: SurfacePatchOperation[];
  reason?: string;
}

const protectedInteractionStates: InteractionState[] = [
  "typing",
  "dictating",
  "dragging",
  "resizing",
  "selecting",
  "reading-change",
  "commit-control",
];

export function createInitialPresentationState(
  overrides: Partial<PresentationState> = {},
): PresentationState {
  return {
    focusedNodeId: null,
    selectedNodeIds: [],
    pinnedNodeIds: [],
    manuallySizedNodeIds: [],
    interactionState: "idle",
    scrollByNodeId: {},
    ...overrides,
  };
}

export function shouldFreezeStructuralAdaptation(state: PresentationState) {
  return protectedInteractionStates.includes(state.interactionState);
}

export function adaptationClassForOperation(operation: SurfacePatchOperation): AdaptationClass {
  switch (operation.type) {
    case "upsertNode":
      return "insertion";
    case "updateNode":
      return "content";
    case "setDisclosure":
      return "disclosure";
    case "moveNode":
      return "relocation";
    case "collapseNode":
      return "removal";
    case "removeNode":
      return "removal";
  }
}

export function reconcileSurfacePatch(
  recipe: SurfaceRecipe,
  patch: SurfacePatch,
  presentation: PresentationState,
): ReconciliationResult {
  if (patch.sessionId !== recipe.sessionId || patch.baseRevision !== recipe.revision) {
    return {
      recipe,
      applied: [],
      deferred: patch.operations,
      reason: "patch revision did not match the active recipe",
    };
  }

  const structuralFreeze = shouldFreezeStructuralAdaptation(presentation);
  const applied: SurfacePatchOperation[] = [];
  const deferred: SurfacePatchOperation[] = [];
  let nodes = recipe.nodes;

  for (const operation of patch.operations) {
    if (shouldDeferOperation(operation, presentation, structuralFreeze)) {
      deferred.push(operation);
      continue;
    }

    nodes = applyOperation(nodes, operation, presentation);
    applied.push(operation);
  }

  return {
    recipe: {
      ...recipe,
      revision: patch.revision,
      nodes,
      transitionReason: patch.reason,
    },
    applied,
    deferred,
  };
}

function shouldDeferOperation(
  operation: SurfacePatchOperation,
  presentation: PresentationState,
  structuralFreeze: boolean,
) {
  const adaptationClass = adaptationClassForOperation(operation);
  if (structuralFreeze && (adaptationClass === "relocation" || adaptationClass === "removal")) {
    return true;
  }

  if (operation.type !== "moveNode" && operation.type !== "removeNode") {
    return false;
  }

  const protectedIds = new Set([
    presentation.focusedNodeId,
    ...presentation.selectedNodeIds,
    ...presentation.pinnedNodeIds,
    ...presentation.manuallySizedNodeIds,
  ].filter((id): id is string => Boolean(id)));

  return protectedIds.has(operation.nodeId);
}

function applyOperation(
  nodes: SurfaceNode[],
  operation: SurfacePatchOperation,
  presentation: PresentationState,
) {
  switch (operation.type) {
    case "upsertNode":
      return nodes.some((node) => node.id === operation.node.id)
        ? nodes.map((node) => (node.id === operation.node.id ? { ...node, ...operation.node } : node))
        : [...nodes, operation.node];
    case "updateNode":
      return nodes.map((node) =>
        node.id === operation.nodeId
          ? {
              ...node,
              ...operation.changes,
              accessibility: operation.changes.accessibility
                ? { ...node.accessibility, ...operation.changes.accessibility }
                : node.accessibility,
            }
          : node,
      );
    case "setDisclosure":
      return nodes.map((node) =>
        node.id === operation.nodeId ? { ...node, disclosureLevel: operation.disclosureLevel } : node,
      );
    case "moveNode":
      return nodes.map((node) =>
        node.id === operation.nodeId && node.placement.canRelocate
          ? { ...node, zoneHint: operation.zoneHint }
          : node,
      );
    case "collapseNode":
      return nodes.map((node) =>
        node.id === operation.nodeId && node.placement.canCollapse
          ? { ...node, disclosureLevel: 0 as const }
          : node,
      );
    case "removeNode":
      if (presentation.pinnedNodeIds.includes(operation.nodeId)) {
        return nodes.map((node) =>
          node.id === operation.nodeId ? { ...node, disclosureLevel: 0 as const } : node,
        );
      }

      return nodes.filter((node) => node.id !== operation.nodeId);
  }
}
