import { Bot, X } from "lucide-react";
import { DeviceControlPanel } from "@/components/device-control/DeviceControlPanel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GazeSettingsPanel } from "@/gaze/react/GazeSettingsPanel";
import { surfaceMetas } from "@/lib/surface-fixtures";
import { cn } from "@/lib/utils";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

interface DevDrawerProps {
  open: boolean;
  activeSurfaceId: string;
  onOpenChange: (open: boolean) => void;
}

export function DevDrawer({ open, activeSurfaceId, onOpenChange }: DevDrawerProps) {
  const setActiveSurface = useSurfaceStore((state) => state.setActiveSurface);
  const applyBlueprintPatch = useSurfaceStore((state) => state.applyBlueprintPatch);
  const toggleDebugHud = useSurfaceStore((state) => state.toggleDebugHud);
  const clearWorkspace = useSurfaceStore((state) => state.clearWorkspace);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" onMouseDown={() => onOpenChange(false)}>
      <aside
        className="glass-panel no-drag ml-auto flex h-full w-[340px] max-w-[calc(100vw-24px)] flex-col"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <div>
            <h2 className="text-sm font-semibold">Developer surfaces</h2>
            <p className="mt-1 text-xs text-muted-foreground">Hidden from the default canvas.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close developer drawer">
            <X className="size-4" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 p-3">
          <GazeSettingsPanel className="mb-4" />
          <DeviceControlPanel />
          <div className="surface-subpanel mb-4 p-3">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Blueprint patch demo</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={toggleDebugHud}>
                Debug HUD
              </Button>
              <Button variant="secondary" size="sm" onClick={clearWorkspace}>
                Clear workspace
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  applyBlueprintPatch(activeSurfaceId, {
                    op: "resize_node",
                    targetNodeId: "voice-comparison-table",
                    widthDelta: 240,
                    heightDelta: 0,
                  })
                }
              >
                Widen table
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  applyBlueprintPatch(activeSurfaceId, {
                    op: "set_node_visibility",
                    targetNodeId: "voice-comparison-sources",
                    visibility: { state: "hidden", reason: "developer demo" },
                  })
                }
              >
                Hide sources
              </Button>
            </div>
          </div>
          <nav className="space-y-1">
            {surfaceMetas.map((surface) => {
              const Icon = surface.icon ?? Bot;
              const selected = activeSurfaceId === surface.id;

              return (
                <button
                  key={surface.id}
                  type="button"
                  className={cn(
                    "motion-control grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md px-3 py-3 text-left",
                    selected
                      ? "bg-primary/15 text-foreground ring-1 ring-primary/25"
                      : "text-muted-foreground hover:bg-surface-selected hover:text-foreground",
                  )}
                  onClick={() => {
                    setActiveSurface(surface.id);
                    onOpenChange(false);
                  }}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border",
                      selected ? "border-primary/30 bg-primary/15 text-primary" : "border-border-subtle bg-surface-2",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{surface.title}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {surface.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>
    </div>
  );
}
