import { Command, Eye, SlidersHorizontal } from "lucide-react";
import { ThemeControls } from "@/components/app/ThemeControls";
import { Button } from "@/components/ui/button";
import type { SurfaceConfig } from "@/types/surface";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

interface FloatingSurfaceControlsProps {
  activeSurface: SurfaceConfig | null;
  gazePanelOpen: boolean;
  onToggleGazePanel: () => void;
  onOpenDevDrawer: () => void;
}

export function FloatingSurfaceControls({
  activeSurface,
  gazePanelOpen,
  onToggleGazePanel,
  onOpenDevDrawer,
}: FloatingSurfaceControlsProps) {
  const setCommandOpen = useSurfaceStore((state) => state.setCommandOpen);

  return (
    <div className="no-drag fixed right-4 top-4 z-40 flex items-center gap-2">
      <ThemeControls />
      {activeSurface ? (
        <div className="surface-toolbar hidden max-w-[320px] truncate rounded-md px-3 py-2 text-xs surface-muted-text sm:block">
          {activeSurface.title}
        </div>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="surface-toolbar motion-control rounded-md"
        onClick={onToggleGazePanel}
        aria-pressed={gazePanelOpen}
        aria-label={gazePanelOpen ? "Hide gaze settings" : "Show gaze settings"}
      >
        <Eye className="size-4" />
        <span className="hidden sm:inline">Gaze</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="surface-toolbar motion-control rounded-md"
        onClick={() => setCommandOpen(true)}
        aria-label="Open command palette"
      >
        <Command className="size-4" />
        <span className="hidden sm:inline">Command</span>
      </Button>
      {import.meta.env.DEV ? (
        <Button
          variant="secondary"
          size="icon"
          className="surface-toolbar motion-control rounded-md"
          onClick={onOpenDevDrawer}
          aria-label="Open developer drawer"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
