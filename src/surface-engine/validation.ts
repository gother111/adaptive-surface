import type {
  SurfaceBlueprint,
  SurfaceComponentType,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodeStatus,
} from "@/surface-engine/blueprint";
import type { SurfacePatch } from "@/surface-engine/patch-types";

const KNOWN_COMPONENT_TYPES = new Set<SurfaceComponentType>([
  "surface_frame",
  "panel",
  "two_pane",
  "section_grid",
  "insight_card",
  "status_pill",
  "confidence_badge",
  "action_list",
  "question_queue",
  "evidence_block",
  "source_chip",
  "risk_badge",
  "decision_option_card",
  "comparison_table",
  "decision_matrix",
  "approval_gate",
  "loading_skeleton",
  "empty_state",
  "voice_correction_chip",
]);

const MODES = new Set<SurfaceMode>(["draft", "streaming", "stable", "needs_approval", "error"]);
const NODE_STATUSES = new Set<SurfaceNodeStatus>(["idle", "forming", "streaming", "ready", "blocked", "error"]);

export function isKnownComponentType(value: unknown): value is SurfaceComponentType {
  return typeof value === "string" && KNOWN_COMPONENT_TYPES.has(value as SurfaceComponentType);
}

export function isSurfaceBlueprint(value: unknown): value is SurfaceBlueprint {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.title === "string" &&
    MODES.has(value.mode as SurfaceMode) &&
    isRecord(value.layout) &&
    Array.isArray(value.components) &&
    value.components.every(isRenderableSurfaceNode)
  );
}

export function isSurfacePatch(value: unknown): value is SurfacePatch {
  return sanitizeSurfacePatch(value) !== null;
}

export function sanitizeSurfacePatch(value: unknown): SurfacePatch | null {
  if (!isRecord(value) || typeof value.op !== "string") {
    return null;
  }

  switch (value.op) {
    case "set_title":
      return typeof value.title === "string" ? { op: value.op, title: value.title } : null;
    case "set_subtitle":
      return typeof value.subtitle === "string" ? { op: value.op, subtitle: value.subtitle } : null;
    case "set_mode":
      return MODES.has(value.mode as SurfaceMode) ? { op: value.op, mode: value.mode as SurfaceMode } : null;
    case "add_component":
      if (!isApprovedSurfaceNode(value.node)) {
        return null;
      }

      return {
        op: value.op,
        parentNodeId: typeof value.parentNodeId === "string" ? value.parentNodeId : undefined,
        node: value.node,
        position: value.position === "start" ? "start" : "end",
      };
    case "remove_component":
      return typeof value.targetNodeId === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId }
        : null;
    case "update_props":
    case "replace_props":
      return typeof value.targetNodeId === "string" && isRecord(value.props)
        ? { op: value.op, targetNodeId: value.targetNodeId, props: value.props }
        : null;
    case "append_item":
      return typeof value.targetNodeId === "string" && typeof value.prop === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId, prop: value.prop, item: value.item }
        : null;
    case "replace_items":
      return typeof value.targetNodeId === "string" && typeof value.prop === "string" && Array.isArray(value.items)
        ? { op: value.op, targetNodeId: value.targetNodeId, prop: value.prop, items: value.items }
        : null;
    case "set_node_streaming":
      return typeof value.targetNodeId === "string" && typeof value.streaming === "boolean"
        ? { op: value.op, targetNodeId: value.targetNodeId, streaming: value.streaming }
        : null;
    case "set_node_status":
      return typeof value.targetNodeId === "string" && NODE_STATUSES.has(value.status as SurfaceNodeStatus)
        ? { op: value.op, targetNodeId: value.targetNodeId, status: value.status as SurfaceNodeStatus }
        : null;
    default:
      return null;
  }
}

function isRenderableSurfaceNode(value: unknown): value is SurfaceNode {
  if (!isRecord(value)) {
    return false;
  }

  const children = value.children;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isRecord(value.props) &&
    (children === undefined || (Array.isArray(children) && children.every(isRenderableSurfaceNode)))
  );
}

function isApprovedSurfaceNode(value: unknown): value is SurfaceNode {
  if (!isRecord(value)) {
    return false;
  }

  const children = value.children;
  return (
    typeof value.id === "string" &&
    isKnownComponentType(value.type) &&
    isRecord(value.props) &&
    (children === undefined || (Array.isArray(children) && children.every(isApprovedSurfaceNode)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
