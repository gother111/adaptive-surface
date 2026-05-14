import type { SurfaceBlueprint, SurfaceNode } from "@/surface-engine/blueprint";
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
