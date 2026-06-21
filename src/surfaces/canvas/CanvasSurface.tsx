import { Tldraw } from "tldraw";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { SurfaceConfig } from "@/types/surface";

interface CanvasSurfaceProps {
  config: SurfaceConfig;
}

export function CanvasSurface({ config }: CanvasSurfaceProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b border-border-subtle px-8 py-5">
        <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />
      </div>
      <div className="relative min-h-0 flex-1 bg-canvas-subtle">
        <Tldraw persistenceKey="adaptive-surface-canvas" />
      </div>
    </div>
  );
}
