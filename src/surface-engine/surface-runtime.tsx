import { Component, memo, useMemo, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSurfaceComponent, SafeFallback } from "@/surface-engine/component-registry";
import type { SurfaceBlueprint, SurfaceNode } from "@/surface-engine/blueprint";
import { isKnownComponentType, isSurfaceBlueprint } from "@/surface-engine/validation";

interface SurfaceRuntimeProps {
  blueprint: SurfaceBlueprint;
}

export function SurfaceRuntime({ blueprint }: SurfaceRuntimeProps) {
  const validBlueprint = useMemo(() => isSurfaceBlueprint(blueprint), [blueprint]);

  if (!validBlueprint) {
    return (
      <ScrollArea className="h-[calc(100vh-3.5rem)]">
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

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)]">
      <div className="min-h-[calc(100vh-3.5rem)]">
        <RuntimeHeader blueprint={blueprint} />
        {blueprint.components.map((node) => (
          <SurfaceRuntimeNode key={node.id} node={node} />
        ))}
      </div>
    </ScrollArea>
  );
}

const SurfaceRuntimeNode = memo(function SurfaceRuntimeNode({ node }: { node: SurfaceNode }) {
  if (!isKnownComponentType(node.type)) {
    return <SafeFallback node={node} />;
  }

  const Component = getSurfaceComponent(node.type);

  return (
    <NodeErrorBoundary node={node}>
      <Component node={node}>
        {node.children?.map((child) => (
          <SurfaceRuntimeNode key={child.id} node={child} />
        ))}
      </Component>
    </NodeErrorBoundary>
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
    <div className="border-b border-white/[0.06] bg-background/70 px-6 py-4 backdrop-blur-xl lg:px-8">
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
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
          {blueprint.mode.replace(/_/g, " ")}
        </div>
      </div>
    </div>
  );
}
