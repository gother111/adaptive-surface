import type { SurfaceBlueprint, SurfaceComponentType, SurfaceNode, SurfaceNodeRole } from "@/surface-engine/blueprint";

export type SurfaceTargetSelector =
  | { type: "byId"; id: string }
  | { type: "byName"; name: string }
  | { type: "byType"; componentType: SurfaceComponentType }
  | { type: "byRole"; role: SurfaceNodeRole }
  | { type: "byTag"; tag: string }
  | { type: "bySemanticText"; text: string }
  | { type: "lastFocused" }
  | { type: "lastSelected" }
  | { type: "fuzzyText"; text: string };

export interface ResolvedSurfaceTarget {
  node: SurfaceNode;
  nodeId: string;
  confidence: number;
  reason: string;
}

const PRIORITY_SCORE: Record<NonNullable<SurfaceNode["priority"]>, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export function resolveSurfaceNodeTarget(
  blueprint: SurfaceBlueprint,
  target: SurfaceTargetSelector,
): ResolvedSurfaceTarget | null {
  const allNodes = flattenSurfaceNodes(blueprint.components);
  const nodes = allNodes.length ? allNodes : [];
  const visibleNodes = nodes.filter(isVisibleNode);

  if (!nodes.length) {
    return null;
  }

  const selectedId = readMetadataString(blueprint, "selectedNodeId");
  const focusedId = readMetadataString(blueprint, "focusedNodeId");

  const byExactId = target.type === "byId" ? nodes.find((node) => node.id === target.id) : null;
  if (byExactId) {
    return resolved(byExactId, 1, "exact id");
  }

  if (target.type === "lastSelected" && selectedId) {
    const node = nodes.find((item) => item.id === selectedId);
    if (node) return resolved(node, 0.98, "last selected");
  }

  if (target.type === "lastFocused" && focusedId) {
    const node = nodes.find((item) => item.id === focusedId);
    if (node) return resolved(node, 0.98, "last focused");
  }

  if ((target.type === "byName" || target.type === "fuzzyText") && selectedId && isDeictic(target.type === "byName" ? target.name : target.text)) {
    const node = nodes.find((item) => item.id === selectedId) ?? nodes.find((item) => item.id === focusedId);
    if (node) return resolved(node, 0.94, "selected reference");
  }

  const scored = nodes
    .map((node) => ({ node, score: scoreNode(node, target, selectedId, focusedId) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored[0]) {
    return resolved(scored[0].node, Math.min(0.96, scored[0].score), target.type);
  }

  return resolved(highestPriorityNode(visibleNodes.length ? visibleNodes : nodes), 0.24, "highest priority visible node");
}

export function flattenSurfaceNodes(nodes: SurfaceNode[]): SurfaceNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenSurfaceNodes(node.children) : [])]);
}

function scoreNode(
  node: SurfaceNode,
  target: SurfaceTargetSelector,
  selectedId?: string,
  focusedId?: string,
) {
  let score = baseNodeScore(node, selectedId, focusedId);

  if (target.type === "byName") {
    return scoreText(target.name, node.name) + scoreText(target.name, node.semanticText) * 0.7 + score;
  }

  if (target.type === "byType") {
    return node.type === target.componentType ? 0.82 + score : 0;
  }

  if (target.type === "byRole") {
    return node.role === target.role ? 0.86 + score : 0;
  }

  if (target.type === "byTag") {
    return (node.tags ?? []).some((tag) => normalize(tag) === normalize(target.tag)) ? 0.84 + score : 0;
  }

  if (target.type === "bySemanticText") {
    return scoreText(target.text, node.semanticText) + scoreText(target.text, node.name) * 0.5 + score;
  }

  if (target.type === "fuzzyText") {
    return (
      scoreText(target.text, node.name) +
      scoreText(target.text, node.semanticText) +
      Math.max(...(node.tags ?? [""]).map((tag) => scoreText(target.text, tag))) * 0.7 +
      scoreText(target.text, node.type.replace(/_/g, " ")) * 0.55 +
      score
    );
  }

  return 0;
}

function scoreText(query: string, candidate?: string) {
  if (!candidate) {
    return 0;
  }

  const queryTokens = tokenSet(query);
  const candidateText = normalize(candidate);
  const candidateTokens = tokenSet(candidate);
  if (!queryTokens.size || !candidateTokens.size) {
    return 0;
  }

  if (candidateText === normalize(query)) {
    return 0.9;
  }

  if (candidateText.includes(normalize(query)) || normalize(query).includes(candidateText)) {
    return 0.74;
  }

  const matches = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  return matches / Math.max(queryTokens.size, candidateTokens.size);
}

function highestPriorityNode(nodes: SurfaceNode[]) {
  return [...nodes].sort((a, b) => baseNodeScore(b) - baseNodeScore(a))[0];
}

function baseNodeScore(node: SurfaceNode, selectedId?: string, focusedId?: string) {
  return (
    (PRIORITY_SCORE[node.priority ?? "normal"] ?? 2) * 0.04 +
    (node.role === "primary_work_object" ? 0.18 : 0) +
    (node.id === selectedId ? 0.12 : 0) +
    (node.id === focusedId ? 0.1 : 0) +
    (isVisibleNode(node) ? 0 : -0.15)
  );
}

function isVisibleNode(node: SurfaceNode) {
  return node.visibility?.state !== "hidden" && node.visibility?.state !== "collapsed";
}

function readMetadataString(blueprint: SurfaceBlueprint, key: string) {
  const value = blueprint.context?.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function isDeictic(value: string) {
  return /\b(it|this|that|selected|focused)\b/i.test(value);
}

function resolved(node: SurfaceNode, confidence: number, reason: string): ResolvedSurfaceTarget {
  return { node, nodeId: node.id, confidence, reason };
}

function tokenSet(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}
