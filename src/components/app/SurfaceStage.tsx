import { Command } from "lucide-react";
import { SurfaceRenderer } from "@/surfaces/SurfaceRenderer";
import type { SurfaceConfig } from "@/types/surface";

interface SurfaceStageProps {
  surface: SurfaceConfig | null;
}

export function SurfaceStage({ surface }: SurfaceStageProps) {
  if (!surface) {
    return (
      <section className="drag-region grid h-screen place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-primary shadow-[0_0_42px_var(--surface-glow)]">
            <Command className="size-5" />
          </div>
          <h1 className="text-lg font-medium">Speak or press Cmd Shift Space</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A surface will form only when there is something useful to show.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-screen min-h-0 overflow-hidden">
      <SurfaceRenderer config={surface} />
    </section>
  );
}
