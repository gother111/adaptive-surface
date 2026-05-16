import type {
  SurfaceDataBinding,
  SurfaceGeometry,
  SurfaceComponentType,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodeStatus,
  SurfaceVisibility,
} from "@/surface-engine/blueprint";

export type SurfacePatch =
  | {
      op: "set_title";
      title: string;
    }
  | {
      op: "set_subtitle";
      subtitle: string;
    }
  | {
      op: "set_mode";
      mode: SurfaceMode;
    }
  | {
      op: "add_component";
      parentNodeId?: string;
      node: SurfaceNode;
      position?: "start" | "end";
    }
  | {
      op: "remove_component";
      targetNodeId: string;
    }
  | {
      op: "update_props";
      targetNodeId: string;
      props: Record<string, unknown>;
    }
  | {
      op: "replace_props";
      targetNodeId: string;
      props: Record<string, unknown>;
    }
  | {
      op: "append_item";
      targetNodeId: string;
      prop: string;
      item: unknown;
    }
  | {
      op: "replace_items";
      targetNodeId: string;
      prop: string;
      items: unknown[];
    }
  | {
      op: "set_node_streaming";
      targetNodeId: string;
      streaming: boolean;
    }
  | {
      op: "set_node_status";
      targetNodeId: string;
      status: SurfaceNodeStatus;
    }
  | {
      op: "focus_node";
      targetNodeId: string;
    }
  | {
      op: "blur_node";
      targetNodeId: string;
    }
  | {
      op: "select_node";
      targetNodeId: string;
    }
  | {
      op: "set_node_geometry";
      targetNodeId: string;
      geometry: Partial<SurfaceGeometry> & Pick<SurfaceGeometry, "x" | "y" | "width" | "height">;
    }
  | {
      op: "move_node";
      targetNodeId: string;
      xDelta: number;
      yDelta: number;
    }
  | {
      op: "resize_node";
      targetNodeId: string;
      widthDelta: number;
      heightDelta: number;
    }
  | {
      op: "bring_node_forward";
      targetNodeId: string;
    }
  | {
      op: "send_node_backward";
      targetNodeId: string;
    }
  | {
      op: "set_node_visibility";
      targetNodeId: string;
      visibility: SurfaceVisibility;
    }
  | {
      op: "set_node_name";
      targetNodeId: string;
      name: string;
    }
  | {
      op: "set_node_semantic_text";
      targetNodeId: string;
      semanticText: string;
    }
  | {
      op: "add_node_tag";
      targetNodeId: string;
      tag: string;
    }
  | {
      op: "remove_node_tag";
      targetNodeId: string;
      tag: string;
    }
  | {
      op: "add_data_binding";
      targetNodeId: string;
      binding: SurfaceDataBinding;
    }
  | {
      op: "update_data_binding";
      targetNodeId: string;
      bindingId: string;
      binding: Partial<SurfaceDataBinding>;
    }
  | {
      op: "remove_data_binding";
      targetNodeId: string;
      bindingId: string;
    };

export interface SurfacePatchEnvelope {
  id: string;
  surfaceId: string;
  patch: SurfacePatch;
  source?: "deterministic" | "local_llm" | "developer";
  componentAllowlist?: SurfaceComponentType[];
  createdAt: number;
}
