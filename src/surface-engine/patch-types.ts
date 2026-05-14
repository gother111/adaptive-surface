import type {
  SurfaceComponentType,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodeStatus,
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
    };

export interface SurfacePatchEnvelope {
  id: string;
  surfaceId: string;
  patch: SurfacePatch;
  source?: "deterministic" | "local_llm" | "developer";
  componentAllowlist?: SurfaceComponentType[];
  createdAt: number;
}
