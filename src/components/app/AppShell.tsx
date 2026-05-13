import { Bot, Command, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SurfaceRenderer } from "@/surfaces/SurfaceRenderer";
import { surfaceMetas } from "@/lib/surface-fixtures";
import { cn } from "@/lib/utils";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function AppShell() {
  const activeSurfaceId = useSurfaceStore((state) => state.activeSurfaceId);
  const setActiveSurface = useSurfaceStore((state) => state.setActiveSurface);
  const setCommandOpen = useSurfaceStore((state) => state.setCommandOpen);
  const surfaces = useSurfaceStore((state) => state.surfaces);
  const activeSurface = surfaces.find((surface) => surface.id === activeSurfaceId) ?? surfaces[0];

  return (
    <main className="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[radial-gradient(circle_at_68%_18%,var(--surface-glow),transparent_30%),linear-gradient(135deg,oklch(0.11_0.02_255),oklch(0.14_0.023_255)_44%,oklch(0.1_0.018_255))]">
      <aside className="traffic-light-safe glass-panel drag-region flex h-screen min-h-0 flex-col border-r border-white/10">
        <div className="flex h-20 items-end px-4 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_32px_var(--surface-glow)]">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Adaptive Surface</h1>
              <p className="truncate text-xs text-muted-foreground">Cmd Shift Space</p>
            </div>
          </div>
        </div>

        <div className="no-drag px-3">
          <Button
            className="w-full justify-start bg-white/[0.08] text-left text-foreground hover:bg-white/[0.12]"
            variant="secondary"
            onClick={() => setCommandOpen(true)}
          >
            <Command className="size-4" />
            Command palette
          </Button>
        </div>

        <Separator className="my-4 bg-white/10" />

        <ScrollArea className="no-drag min-h-0 flex-1 px-3">
          <nav className="space-y-1 pb-4">
            {surfaceMetas.map((surface) => {
              const Icon = surface.icon ?? Bot;
              const selected = activeSurfaceId === surface.id;

              return (
                <button
                  key={surface.id}
                  type="button"
                  className={cn(
                    "group grid w-full grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md px-3 py-3 text-left transition-colors",
                    selected
                      ? "bg-primary/15 text-foreground ring-1 ring-primary/25"
                      : "text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
                  )}
                  onClick={() => setActiveSurface(surface.id)}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border",
                      selected ? "border-primary/30 bg-primary/15 text-primary" : "border-white/[0.08] bg-white/5",
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

        <div className="no-drag border-t border-white/10 p-4">
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="size-2 rounded-full bg-primary shadow-[0_0_18px_var(--surface-glow)]" />
              Local-first shell
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Ready for LangGraph, FastAPI, model routing, and approval-gated automations.
            </p>
          </div>
        </div>
      </aside>

      <section className="relative min-h-0 overflow-hidden">
        <header className="drag-region flex h-14 items-center justify-between border-b border-white/[0.08] px-6">
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {activeSurface.kind}
            </p>
            <h2 className="truncate text-sm font-medium text-foreground">{activeSurface.title}</h2>
          </div>
          <div className="no-drag flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Streaming-ready</span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Tauri 2</span>
          </div>
        </header>

        <SurfaceRenderer config={activeSurface} />
      </section>
    </main>
  );
}
