import type { SurfaceBlueprint, SurfaceDataBinding, SurfaceGeometry, SurfaceNode } from "@/surface-engine/blueprint";
import type { SurfacePatch } from "@/surface-engine/patch-types";
import { sanitizeSurfacePatch } from "@/surface-engine/validation";

export function applySurfacePatch(blueprint: SurfaceBlueprint, patch: SurfacePatch): SurfaceBlueprint {
  const safePatch = sanitizeSurfacePatch(patch);

  if (!safePatch) {
    return blueprint;
  }

  const updatedAt = Date.now();

  switch (safePatch.op) {
    case "set_title":
      return { ...blueprint, title: safePatch.title, updatedAt };
    case "set_subtitle":
      return { ...blueprint, subtitle: safePatch.subtitle, updatedAt };
    case "set_mode":
      return { ...blueprint, mode: safePatch.mode, updatedAt };
    case "add_component": {
      if (!safePatch.parentNodeId) {
        return {
          ...blueprint,
          components: insertNode(blueprint.components, safePatch.node, safePatch.position),
          updatedAt,
        };
      }

      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.parentNodeId, (node) => ({
        ...node,
        children: insertNode(node.children ?? [], safePatch.node, safePatch.position),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "remove_component": {
      const { nodes, changed } = removeNode(blueprint.components, safePatch.targetNodeId);
      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "update_props": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        props: { ...node.props, ...safePatch.props },
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "replace_props": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        props: safePatch.props as SurfaceNode["props"],
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "append_item": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => {
        const current = readArrayProp(node.props, safePatch.prop);

        return {
          ...node,
          props: {
            ...node.props,
            [safePatch.prop]: [...current, safePatch.item],
          },
        };
      });

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "replace_items": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        props: {
          ...node.props,
          [safePatch.prop]: [...safePatch.items],
        },
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "set_node_streaming": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        streaming: safePatch.streaming,
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "set_node_status": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        status: safePatch.status,
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "focus_node":
      return hasNode(blueprint.components, safePatch.targetNodeId)
        ? {
            ...blueprint,
            context: setContextMetadata(blueprint, "focusedNodeId", safePatch.targetNodeId),
            updatedAt,
          }
        : blueprint;
    case "blur_node":
      return getContextMetadata(blueprint, "focusedNodeId") === safePatch.targetNodeId
        ? {
            ...blueprint,
            context: setContextMetadata(blueprint, "focusedNodeId", null),
            updatedAt,
          }
        : blueprint;
    case "select_node":
      return hasNode(blueprint.components, safePatch.targetNodeId)
        ? {
            ...blueprint,
            context: setContextMetadata(blueprint, "selectedNodeId", safePatch.targetNodeId),
            updatedAt,
          }
        : blueprint;
    case "set_node_geometry": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        geometry: clampGeometry({ ...node.geometry, ...safePatch.geometry }),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "move_node": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => {
        const geometry = defaultGeometry(node.geometry);

        return {
          ...node,
          geometry: clampGeometry({
            ...geometry,
            x: geometry.x + safePatch.xDelta,
            y: geometry.y + safePatch.yDelta,
          }),
        };
      });

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "resize_node": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => {
        const geometry = defaultGeometry(node.geometry);

        return {
          ...node,
          geometry: clampGeometry({
            ...geometry,
            width: geometry.width + safePatch.widthDelta,
            height: geometry.height + safePatch.heightDelta,
          }),
        };
      });

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "bring_node_forward": {
      const maxZ = maxZIndex(blueprint.components);
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        geometry: clampGeometry({ ...defaultGeometry(node.geometry), zIndex: maxZ + 1 }),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "send_node_backward": {
      const minZ = minZIndex(blueprint.components);
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        geometry: clampGeometry({ ...defaultGeometry(node.geometry), zIndex: minZ - 1 }),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "set_node_visibility": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        visibility: safePatch.visibility,
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "set_node_name": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        name: safePatch.name,
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "set_node_semantic_text": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        semanticText: safePatch.semanticText,
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "add_node_tag": {
      const tag = normalizeTag(safePatch.tag);
      if (!tag) {
        return blueprint;
      }

      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        tags: Array.from(new Set([...(node.tags ?? []), tag])),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "remove_node_tag": {
      const tag = normalizeTag(safePatch.tag);
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        tags: (node.tags ?? []).filter((item) => normalizeTag(item) !== tag),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "add_data_binding": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        bindings: upsertBinding(node.bindings ?? [], safePatch.binding),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "update_data_binding": {
      if (!hasDataBinding(blueprint.components, safePatch.targetNodeId, safePatch.bindingId)) {
        return blueprint;
      }

      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => {
        const bindings = node.bindings ?? [];
        return {
          ...node,
          bindings: bindings.map((binding) =>
            binding.id === safePatch.bindingId ? { ...binding, ...safePatch.binding, id: binding.id } : binding,
          ),
        };
      });

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
    case "remove_data_binding": {
      const { nodes, changed } = updateNodeTree(blueprint.components, safePatch.targetNodeId, (node) => ({
        ...node,
        bindings: (node.bindings ?? []).filter((binding) => binding.id !== safePatch.bindingId),
      }));

      return changed ? { ...blueprint, components: nodes, updatedAt } : blueprint;
    }
  }
}

export function applySurfacePatches(
  blueprint: SurfaceBlueprint,
  patches: SurfacePatch[],
): SurfaceBlueprint {
  return patches.reduce((current, patch) => applySurfacePatch(current, patch), blueprint);
}

function insertNode(nodes: SurfaceNode[], node: SurfaceNode, position: "start" | "end" = "end") {
  return position === "start" ? [node, ...nodes] : [...nodes, node];
}

function updateNodeTree(
  nodes: SurfaceNode[],
  targetNodeId: string,
  updater: (node: SurfaceNode) => SurfaceNode,
): { nodes: SurfaceNode[]; changed: boolean } {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (node.id === targetNodeId) {
      changed = true;
      return updater(node);
    }

    if (!node.children?.length) {
      return node;
    }

    const childResult = updateNodeTree(node.children, targetNodeId, updater);
    if (!childResult.changed) {
      return node;
    }

    changed = true;
    return { ...node, children: childResult.nodes } as SurfaceNode;
  });

  return { nodes: nextNodes, changed };
}

function removeNode(nodes: SurfaceNode[], targetNodeId: string): { nodes: SurfaceNode[]; changed: boolean } {
  let changed = false;
  const keptNodes: SurfaceNode[] = [];

  for (const node of nodes) {
    if (node.id === targetNodeId) {
      changed = true;
      continue;
    }

    if (!node.children?.length) {
      keptNodes.push(node);
      continue;
    }

    const childResult = removeNode(node.children, targetNodeId);
    changed = changed || childResult.changed;
    keptNodes.push(childResult.changed ? ({ ...node, children: childResult.nodes } as SurfaceNode) : node);
  }

  return { nodes: keptNodes, changed };
}

function readArrayProp(props: SurfaceNode["props"], prop: string) {
  const value = (props as Record<string, unknown>)[prop];
  return Array.isArray(value) ? value : [];
}

function hasNode(nodes: SurfaceNode[], targetNodeId: string): boolean {
  return nodes.some((node) => node.id === targetNodeId || (node.children ? hasNode(node.children, targetNodeId) : false));
}

function hasDataBinding(nodes: SurfaceNode[], targetNodeId: string, bindingId: string): boolean {
  return nodes.some((node) => {
    if (node.id === targetNodeId) {
      return (node.bindings ?? []).some((binding) => binding.id === bindingId);
    }

    return node.children ? hasDataBinding(node.children, targetNodeId, bindingId) : false;
  });
}

function defaultGeometry(geometry?: SurfaceGeometry): SurfaceGeometry {
  return {
    x: geometry?.x ?? 80,
    y: geometry?.y ?? 80,
    width: geometry?.width ?? 420,
    height: geometry?.height ?? 320,
    minWidth: geometry?.minWidth,
    minHeight: geometry?.minHeight,
    maxWidth: geometry?.maxWidth,
    maxHeight: geometry?.maxHeight,
    zIndex: geometry?.zIndex ?? 1,
    anchor: geometry?.anchor ?? "free",
  };
}

function clampGeometry(geometry: SurfaceGeometry): SurfaceGeometry {
  const minWidth = clampOptional(geometry.minWidth, 120, 1600);
  const minHeight = clampOptional(geometry.minHeight, 80, 1200);
  const maxWidth = clampOptional(geometry.maxWidth, minWidth ?? 120, 2400);
  const maxHeight = clampOptional(geometry.maxHeight, minHeight ?? 80, 1800);
  const floorWidth = minWidth ?? 160;
  const floorHeight = minHeight ?? 96;
  const ceilingWidth = maxWidth ?? 1800;
  const ceilingHeight = maxHeight ?? 1400;

  return {
    ...geometry,
    x: clampNumber(geometry.x, -2400, 2400),
    y: clampNumber(geometry.y, -1800, 1800),
    width: clampNumber(geometry.width, floorWidth, ceilingWidth),
    height: clampNumber(geometry.height, floorHeight, ceilingHeight),
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    zIndex: clampNumber(geometry.zIndex ?? 1, -100, 1000),
    anchor: geometry.anchor ?? "free",
  };
}

function upsertBinding(bindings: SurfaceDataBinding[], binding: SurfaceDataBinding) {
  const existing = bindings.some((item) => item.id === binding.id);
  return existing ? bindings.map((item) => (item.id === binding.id ? { ...item, ...binding } : item)) : [...bindings, binding];
}

function maxZIndex(nodes: SurfaceNode[]): number {
  return flattenNodes(nodes).reduce((max, node) => Math.max(max, node.geometry?.zIndex ?? 1), 1);
}

function minZIndex(nodes: SurfaceNode[]): number {
  return flattenNodes(nodes).reduce((min, node) => Math.min(min, node.geometry?.zIndex ?? 1), 1);
}

function flattenNodes(nodes: SurfaceNode[]): SurfaceNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenNodes(node.children) : [])]);
}

function setContextMetadata(blueprint: SurfaceBlueprint, key: string, value: string | number | boolean | null) {
  return {
    ...blueprint.context,
    metadata: {
      ...(blueprint.context?.metadata ?? {}),
      [key]: value,
    },
  };
}

function getContextMetadata(blueprint: SurfaceBlueprint, key: string) {
  return blueprint.context?.metadata?.[key];
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function clampOptional(value: number | undefined, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampNumber(value, min, max) : undefined;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
