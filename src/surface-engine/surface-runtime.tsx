import { Component, memo, useMemo, type CSSProperties, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getSurfaceComponent, SafeFallback } from "@/surface-engine/component-registry";
import type { SurfaceBlueprint, SurfaceNode } from "@/surface-engine/blueprint";
import { isKnownComponentType, isSurfaceBlueprint } from "@/surface-engine/validation";

interface SurfaceRuntimeProps {
  blueprint: SurfaceBlueprint;
  surfaceId?: string;
  onSelectNode?: (surfaceId: string, nodeId: string) => void;
  onFocusNode?: (surfaceId: string, nodeId: string) => void;
}

export function SurfaceRuntime({ blueprint, surfaceId, onSelectNode, onFocusNode }: SurfaceRuntimeProps) {
  const validBlueprint = useMemo(() => isSurfaceBlueprint(blueprint), [blueprint]);

  if (!validBlueprint) {
    return (
      <ScrollArea className="h-[calc(100vh-13rem)]">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-5">
            <h2 className="text-sm font-semibold">Surface could not be rendered safely</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The blueprint did not match the approved runtime schema.
            </p>
          </div>
        </div>
      </ScrollArea>
    );
  }

  if (blueprint.layout.type === "spatial_canvas") {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <div className="relative h-full min-h-[calc(100vh-13rem)] overflow-hidden">
          {blueprint.components.map((node) => (
            <SurfaceRuntimeNode
              key={node.id}
              node={node}
              blueprint={blueprint}
              spatial
              surfaceId={surfaceId}
              onSelectNode={onSelectNode}
              onFocusNode={onFocusNode}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-13rem)]">
      <div className="min-h-[calc(100vh-13rem)]">
        <RuntimeHeader blueprint={blueprint} />
        {blueprint.components.map((node) => (
          <SurfaceRuntimeNode
            key={node.id}
            node={node}
            blueprint={blueprint}
            surfaceId={surfaceId}
            onSelectNode={onSelectNode}
            onFocusNode={onFocusNode}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

const SurfaceRuntimeNode = memo(function SurfaceRuntimeNode({
  node,
  blueprint,
  spatial = false,
  surfaceId,
  onSelectNode,
  onFocusNode,
}: {
  node: SurfaceNode;
  blueprint: SurfaceBlueprint;
  spatial?: boolean;
  surfaceId?: string;
  onSelectNode?: (surfaceId: string, nodeId: string) => void;
  onFocusNode?: (surfaceId: string, nodeId: string) => void;
}) {
  if (node.visibility?.state === "hidden" || node.visibility?.state === "collapsed") {
    return null;
  }

  if (!isKnownComponentType(node.type)) {
    return <SafeFallback node={node} />;
  }

  const Component = getSurfaceComponent(node.type);
  const children = node.children?.map((child) => (
    <SurfaceRuntimeNode
      key={child.id}
      node={child}
      blueprint={blueprint}
      surfaceId={surfaceId}
      onSelectNode={onSelectNode}
      onFocusNode={onFocusNode}
    />
  ));
  const focused = blueprint.context?.metadata?.focusedNodeId === node.id;
  const selected = blueprint.context?.metadata?.selectedNodeId === node.id;
  const minimized = node.visibility?.state === "minimized";
  const nodeContent = (
    <NodeErrorBoundary node={node}>
      {minimized ? (
        <button
          type="button"
          className="rounded-lg border border-border-subtle bg-card/80 px-4 py-3 text-left text-sm text-muted-foreground"
          onClick={() => surfaceId && onSelectNode?.(surfaceId, node.id)}
        >
          {node.name ?? node.semanticText ?? "Minimized surface object"}
        </button>
      ) : (
        <Component node={node}>{children}</Component>
      )}
    </NodeErrorBoundary>
  );

  if (!spatial || !node.geometry) {
    return nodeContent;
  }

  return (
    <div
      className={cn(
        "absolute transition-[left,top,width,height,box-shadow,opacity,transform] duration-200 ease-out",
        selected && "rounded-xl ring-1 ring-primary/55",
        focused && "rounded-xl shadow-[var(--shadow-surface)] ring-1 ring-primary/45",
      )}
      style={geometryStyle(node)}
      role={node.interaction?.selectable ? "button" : undefined}
      tabIndex={node.interaction?.focusable ? 0 : undefined}
      onMouseDown={() => surfaceId && onSelectNode?.(surfaceId, node.id)}
      onFocus={() => surfaceId && onFocusNode?.(surfaceId, node.id)}
    >
      {nodeContent}
    </div>
  );
});

class NodeErrorBoundary extends Component<
  { node: SurfaceNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <SafeFallback node={this.props.node} />;
    }

    return this.props.children;
  }
}

function RuntimeHeader({ blueprint }: SurfaceRuntimeProps) {
  return (
    <div className="border-b border-border-subtle bg-background/70 px-6 py-4 backdrop-blur-xl lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {blueprint.kind.replace(/_/g, " ")} surface
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold">{blueprint.title}</h1>
          {blueprint.subtitle ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{blueprint.subtitle}</p>
          ) : null}
        </div>
        <div className="rounded-full border border-border-subtle bg-surface-2 px-3 py-1 text-xs text-muted-foreground">
          {blueprint.mode.replace(/_/g, " ")}
        </div>
      </div>
    </div>
  );
}

function geometryStyle(node: SurfaceNode): CSSProperties {
  const geometry = node.geometry;
  if (!geometry) {
    return {};
  }

  return {
    left: geometry.x,
    top: geometry.y,
    width: geometry.width,
    height: node.visibility?.state === "minimized" ? undefined : geometry.height,
    minWidth: geometry.minWidth,
    minHeight: geometry.minHeight,
    maxWidth: geometry.maxWidth,
    maxHeight: geometry.maxHeight,
    zIndex: geometry.zIndex,
  };
}
