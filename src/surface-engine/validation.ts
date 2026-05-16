import type {
  ContextSourceKind,
  SurfaceDataBinding,
  SurfaceBlueprint,
  SurfaceComponentType,
  SurfaceGeometry,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodeStatus,
  SurfaceVisibility,
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
  "data_binding_chip",
  "context_source_chip",
  "email_draft_surface",
  "email_body",
  "calendar_context",
]);

const MODES = new Set<SurfaceMode>(["draft", "streaming", "stable", "needs_approval", "error"]);
const NODE_STATUSES = new Set<SurfaceNodeStatus>(["idle", "forming", "streaming", "ready", "blocked", "error"]);
const VISIBILITY_STATES = new Set<SurfaceVisibility["state"]>(["visible", "hidden", "collapsed", "minimized"]);
const BINDING_SOURCES = new Set<ContextSourceKind>([
  "local_files",
  "apple_mail",
  "apple_notes",
  "apple_calendar",
  "apple_reminders",
  "browser",
  "web_search",
  "github",
  "slack",
  "manual",
  "memory",
]);
const BINDING_STATUSES = new Set<SurfaceDataBinding["status"]>([
  "idle",
  "planned",
  "loading",
  "available",
  "needs_permission",
  "error",
]);

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
    case "focus_node":
    case "blur_node":
    case "select_node":
    case "bring_node_forward":
    case "send_node_backward":
      return typeof value.targetNodeId === "string" ? { op: value.op, targetNodeId: value.targetNodeId } : null;
    case "set_node_geometry":
      return typeof value.targetNodeId === "string" && isSurfaceGeometry(value.geometry)
        ? { op: value.op, targetNodeId: value.targetNodeId, geometry: value.geometry }
        : null;
    case "move_node":
      return typeof value.targetNodeId === "string" && isFiniteNumber(value.xDelta) && isFiniteNumber(value.yDelta)
        ? { op: value.op, targetNodeId: value.targetNodeId, xDelta: value.xDelta, yDelta: value.yDelta }
        : null;
    case "resize_node":
      return typeof value.targetNodeId === "string" && isFiniteNumber(value.widthDelta) && isFiniteNumber(value.heightDelta)
        ? { op: value.op, targetNodeId: value.targetNodeId, widthDelta: value.widthDelta, heightDelta: value.heightDelta }
        : null;
    case "set_node_visibility":
      return typeof value.targetNodeId === "string" && isSurfaceVisibility(value.visibility)
        ? { op: value.op, targetNodeId: value.targetNodeId, visibility: value.visibility }
        : null;
    case "set_node_name":
      return typeof value.targetNodeId === "string" && typeof value.name === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId, name: value.name }
        : null;
    case "set_node_semantic_text":
      return typeof value.targetNodeId === "string" && typeof value.semanticText === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId, semanticText: value.semanticText }
        : null;
    case "add_node_tag":
    case "remove_node_tag":
      return typeof value.targetNodeId === "string" && typeof value.tag === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId, tag: value.tag }
        : null;
    case "add_data_binding":
      return typeof value.targetNodeId === "string" && isSurfaceDataBinding(value.binding)
        ? { op: value.op, targetNodeId: value.targetNodeId, binding: value.binding }
        : null;
    case "update_data_binding":
      return typeof value.targetNodeId === "string" &&
        typeof value.bindingId === "string" &&
        isPartialSurfaceDataBinding(value.binding)
        ? { op: value.op, targetNodeId: value.targetNodeId, bindingId: value.bindingId, binding: value.binding }
        : null;
    case "remove_data_binding":
      return typeof value.targetNodeId === "string" && typeof value.bindingId === "string"
        ? { op: value.op, targetNodeId: value.targetNodeId, bindingId: value.bindingId }
        : null;
    default:
      return null;
  }
}

export function isSurfaceDataBinding(value: unknown): value is SurfaceDataBinding {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    BINDING_SOURCES.has(value.source as ContextSourceKind) &&
    BINDING_STATUSES.has(value.status as SurfaceDataBinding["status"]) &&
    (value.fields === undefined || (Array.isArray(value.fields) && value.fields.every((field) => typeof field === "string")))
  );
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

function isPartialSurfaceDataBinding(value: unknown): value is Partial<SurfaceDataBinding> {
  if (!isRecord(value)) {
    return false;
  }

  if (value.source !== undefined && !BINDING_SOURCES.has(value.source as ContextSourceKind)) {
    return false;
  }

  if (value.status !== undefined && !BINDING_STATUSES.has(value.status as SurfaceDataBinding["status"])) {
    return false;
  }

  if (value.fields !== undefined && (!Array.isArray(value.fields) || !value.fields.every((field) => typeof field === "string"))) {
    return false;
  }

  return true;
}

function isSurfaceGeometry(value: unknown): value is SurfaceGeometry {
  if (!isRecord(value)) {
    return false;
  }

  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.width) && isFiniteNumber(value.height);
}

function isSurfaceVisibility(value: unknown): value is SurfaceVisibility {
  return isRecord(value) && VISIBILITY_STATES.has(value.state as SurfaceVisibility["state"]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
