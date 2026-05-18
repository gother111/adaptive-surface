import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SurfaceInstance, WorkspaceSession } from "@/workspace/types";

interface WorkspaceGridProps {
  session: WorkspaceSession;
  renderSurface: (surface: SurfaceInstance) => ReactNode;
}

export function WorkspaceGrid({ session, renderSurface }: WorkspaceGridProps) {
  const activeSurfaces = session.surfaces.filter((surface) => surface.status !== "hidden" && surface.role !== "debug");
  const mainSurface =
    activeSurfaces.find((surface) => surface.id === session.primarySurfaceId) ??
    activeSurfaces.find((surface) => surface.zone === "main") ??
    activeSurfaces[0];
  const sideSurfaces = activeSurfaces.filter((surface) => surface.id !== mainSurface?.id);
  const leftRail = sideSurfaces.filter((surface) => normalizeZone(surface.zone) === "leftRail").sort(sortByUpdated);
  const rightRail = sideSurfaces.filter((surface) => normalizeZone(surface.zone) === "rightRail").sort(sortByUpdated);
  const bottomDock = sideSurfaces.filter((surface) => normalizeZone(surface.zone) === "bottomDock").sort(sortByUpdated);

  return (
    <section className="h-screen min-h-0 overflow-hidden px-4 pb-24 pt-16 sm:px-5 lg:px-6">
      <div
        className={cn(
          "mx-auto grid h-full max-w-[1680px] grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4",
          "xl:grid-cols-[minmax(240px,340px)_minmax(0,1fr)_minmax(260px,380px)]",
        )}
      >
        <Rail className="xl:col-start-1 xl:row-start-1" surfaces={leftRail} renderSurface={renderSurface} />
        <main className="no-drag min-h-0 xl:col-start-2 xl:row-start-1">
          {mainSurface ? renderSurface(mainSurface) : null}
        </main>
        <Rail className="xl:col-start-3 xl:row-start-1" surfaces={rightRail} renderSurface={renderSurface} />
        {bottomDock.length ? (
          <div className="no-drag grid max-h-52 gap-3 overflow-auto xl:col-span-3 xl:row-start-2 xl:grid-cols-2">
            {bottomDock.map((surface) => (
              <div key={surface.id}>{renderSurface(surface)}</div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Rail({
  surfaces,
  renderSurface,
  className,
}: {
  surfaces: SurfaceInstance[];
  renderSurface: (surface: SurfaceInstance) => ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("no-drag flex min-h-0 flex-col gap-3 overflow-auto pr-1", className)}>
      {surfaces.map((surface) => (
        <div key={surface.id}>{renderSurface(surface)}</div>
      ))}
    </aside>
  );
}

function normalizeZone(zone: SurfaceInstance["zone"]) {
  if (zone === "left" || zone === "top_left" || zone === "bottom_left") return "leftRail";
  if (zone === "right") return "rightRail";
  if (zone === "bottom" || zone === "overlay") return "bottomDock";
  return zone;
}

function sortByUpdated(a: SurfaceInstance, b: SurfaceInstance) {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
}
