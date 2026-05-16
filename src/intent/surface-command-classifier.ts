import type { SurfaceBlueprint } from "@/surface-engine/blueprint";
import type { SurfacePatch } from "@/surface-engine/patch-types";
import { resolveSurfaceNodeTarget, type SurfaceTargetSelector } from "@/surface-engine/targeting";

export type SurfaceCommandKind =
  | "resize"
  | "move"
  | "focus"
  | "hide"
  | "show"
  | "collapse"
  | "expand"
  | "select"
  | "bring_forward"
  | "send_backward";

export interface SurfaceCommand {
  kind: SurfaceCommandKind;
  target: SurfaceTargetSelector;
  widthDelta?: number;
  heightDelta?: number;
  xDelta?: number;
  yDelta?: number;
}

export function classifySurfaceCommand(transcript: string): SurfaceCommand | null {
  const normalized = normalize(transcript);
  if (!normalized || !looksLikeMutation(normalized)) {
    return null;
  }

  const target = parseTarget(normalized);

  if (/\b(focus|zoom in on|look at|center)\b/.test(normalized)) {
    return { kind: "focus", target };
  }

  if (/\b(select|choose this|grab)\b/.test(normalized)) {
    return { kind: "select", target };
  }

  if (/\b(hide|dismiss|remove from view)\b/.test(normalized)) {
    return { kind: "hide", target };
  }

  if (/\b(show|reveal|bring back)\b/.test(normalized)) {
    return { kind: "show", target };
  }

  if (/\b(collapse|minimize)\b/.test(normalized)) {
    return { kind: "collapse", target };
  }

  if (/\b(expand|open it up)\b/.test(normalized)) {
    return { kind: "expand", target, widthDelta: 180, heightDelta: 120 };
  }

  if (/\b(bring|move).*\b(forward|front)\b/.test(normalized)) {
    return { kind: "bring_forward", target };
  }

  if (/\b(send|move).*\b(back|behind|backward)\b/.test(normalized)) {
    return { kind: "send_backward", target };
  }

  if (/\b(move|shift|nudge)\b/.test(normalized)) {
    return {
      kind: "move",
      target,
      ...directionDelta(normalized),
    };
  }

  if (/\b(bigger|larger|wider|taller|smaller|shorter|narrower|resize)\b/.test(normalized)) {
    return {
      kind: "resize",
      target,
      ...resizeDelta(normalized),
    };
  }

  return null;
}

export function surfaceCommandToPatch(
  blueprint: SurfaceBlueprint,
  command: SurfaceCommand,
): SurfacePatch | null {
  const resolved = resolveSurfaceNodeTarget(blueprint, command.target);
  if (!resolved) {
    return null;
  }

  switch (command.kind) {
    case "resize":
      return {
        op: "resize_node",
        targetNodeId: resolved.nodeId,
        widthDelta: command.widthDelta ?? 0,
        heightDelta: command.heightDelta ?? 0,
      };
    case "move":
      return {
        op: "move_node",
        targetNodeId: resolved.nodeId,
        xDelta: command.xDelta ?? 0,
        yDelta: command.yDelta ?? 0,
      };
    case "focus":
      return { op: "focus_node", targetNodeId: resolved.nodeId };
    case "select":
      return { op: "select_node", targetNodeId: resolved.nodeId };
    case "hide":
      return { op: "set_node_visibility", targetNodeId: resolved.nodeId, visibility: { state: "hidden", reason: "voice command" } };
    case "show":
      return { op: "set_node_visibility", targetNodeId: resolved.nodeId, visibility: { state: "visible" } };
    case "collapse":
      return { op: "set_node_visibility", targetNodeId: resolved.nodeId, visibility: { state: "collapsed", reason: "voice command" } };
    case "expand":
      return {
        op: "resize_node",
        targetNodeId: resolved.nodeId,
        widthDelta: command.widthDelta ?? 180,
        heightDelta: command.heightDelta ?? 120,
      };
    case "bring_forward":
      return { op: "bring_node_forward", targetNodeId: resolved.nodeId };
    case "send_backward":
      return { op: "send_node_backward", targetNodeId: resolved.nodeId };
  }
}

function looksLikeMutation(value: string) {
  return /\b(make|resize|move|shift|nudge|hide|show|reveal|collapse|minimize|expand|focus|select|bring|send)\b/.test(value);
}

function parseTarget(value: string): SurfaceTargetSelector {
  if (/\b(it|this|that|selected|focused)\b/.test(value)) {
    return { type: "lastSelected" };
  }

  if (/\b(?:table|matrix|comparison)\b/.test(value)) {
    return { type: "fuzzyText", text: "comparison table matrix" };
  }

  if (/\b(?:sources?|evidence|context)\b/.test(value)) {
    return { type: "fuzzyText", text: "sources evidence context" };
  }

  if (/\b(?:approval|permission|approve)\b/.test(value)) {
    return { type: "fuzzyText", text: "approval card permission" };
  }

  if (/\b(?:notes?|capture|synthesis)\b/.test(value)) {
    return { type: "fuzzyText", text: "notes capture synthesis" };
  }

  if (/\bleft panel\b/.test(value)) {
    return { type: "fuzzyText", text: "left panel" };
  }

  const name = value
    .replace(/\b(make|resize|move|shift|nudge|hide|show|reveal|collapse|minimize|expand|focus|select|bring|send|to|the|a|an|on|forward|back|wider|taller|bigger|larger|smaller|shorter|right|left|up|down)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return name ? { type: "fuzzyText", text: name } : { type: "lastSelected" };
}

function resizeDelta(value: string) {
  if (/\bwider\b/.test(value)) return { widthDelta: 240, heightDelta: 0 };
  if (/\bnarrower\b/.test(value)) return { widthDelta: -180, heightDelta: 0 };
  if (/\btaller\b/.test(value)) return { widthDelta: 0, heightDelta: 180 };
  if (/\bshorter\b/.test(value)) return { widthDelta: 0, heightDelta: -140 };
  if (/\bsmaller\b/.test(value)) return { widthDelta: -160, heightDelta: -120 };
  return { widthDelta: 180, heightDelta: 120 };
}

function directionDelta(value: string) {
  if (/\bright\b/.test(value)) return { xDelta: 120, yDelta: 0 };
  if (/\bleft\b/.test(value)) return { xDelta: -120, yDelta: 0 };
  if (/\bup\b/.test(value)) return { xDelta: 0, yDelta: -96 };
  if (/\bdown\b/.test(value)) return { xDelta: 0, yDelta: 96 };
  return { xDelta: 80, yDelta: 0 };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
