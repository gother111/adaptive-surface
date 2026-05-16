import { Command, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SurfaceConfig } from "@/types/surface";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

interface FloatingSurfaceControlsProps {
  activeSurface: SurfaceConfig | null;
  onOpenDevDrawer: () => void;
}

export function FloatingSurfaceControls({ activeSurface, onOpenDevDrawer }: FloatingSurfaceControlsProps) {
  const setCommandOpen = useSurfaceStore((state) => state.setCommandOpen);

  return (
    <div className="no-drag fixed right-4 top-4 z-40 flex items-center gap-2">
      {activeSurface ? (
        <div className="hidden max-w-[320px] truncate rounded-full border border-white/10 bg-background/55 px-3 py-2 text-xs text-muted-foreground shadow-xl backdrop-blur-xl sm:block">
          {activeSurface.title}
        </div>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="rounded-full border border-white/10 bg-background/65 shadow-xl backdrop-blur-xl"
        onClick={() => setCommandOpen(true)}
      >
        <Command className="size-4" />
        Command
      </Button>
      {import.meta.env.DEV ? (
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full border border-white/10 bg-background/65 shadow-xl backdrop-blur-xl"
          onClick={onOpenDevDrawer}
          aria-label="Open developer drawer"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
