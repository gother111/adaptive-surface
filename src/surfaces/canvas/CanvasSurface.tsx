import { Tldraw } from "tldraw";
import { SurfaceHeader } from "@/surfaces/shared/SurfaceHeader";
import type { SurfaceConfig } from "@/types/surface";

interface CanvasSurfaceProps {
  config: SurfaceConfig;
}

export function CanvasSurface({ config }: CanvasSurfaceProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b border-white/[0.08] px-8 py-5">
        <SurfaceHeader title={config.title} subtitle={config.subtitle} status={config.streamStatus} />
      </div>
      <div className="relative min-h-0 flex-1 bg-[linear-gradient(135deg,oklch(0.13_0.016_255),oklch(0.17_0.018_255))]">
        <Tldraw persistenceKey="adaptive-surface-canvas" />
      </div>
    </div>
  );
}
