import { useState } from "react";
import { DevDrawer } from "@/components/app/DevDrawer";
import { FloatingSurfaceControls } from "@/components/app/FloatingSurfaceControls";
import { SurfaceStage } from "@/components/app/SurfaceStage";
import { FoundationCommandBar } from "@/components/command/FoundationCommandBar";
import { WorkspaceStage } from "@/components/workspace/WorkspaceStage";
import { GazeSettingsPanel } from "@/gaze/react/GazeSettingsPanel";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function AppShell() {
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);
  const [gazePanelOpen, setGazePanelOpen] = useState(false);
  const activeSurfaceId = useSurfaceStore((state) => state.activeSurfaceId);
  const surfaces = useSurfaceStore((state) => state.surfaces);
  const draftSurface = useSurfaceStore((state) => state.draftSurface);
  const workspaceSession = useSurfaceStore((state) => state.workspaceSession);
  const hasWorkspaceSurfaces = workspaceSession.surfaces.some(
    (surface) => surface.status !== "hidden" && surface.role !== "debug",
  );
  const activeSurface =
    draftSurface && activeSurfaceId === draftSurface.id
      ? draftSurface
      : surfaces.find((surface) => surface.id === activeSurfaceId) ?? null;

  return (
    <main className="surface-app relative h-screen overflow-hidden">
      {hasWorkspaceSurfaces ? <WorkspaceStage session={workspaceSession} /> : <SurfaceStage surface={activeSurface} />}
      <FloatingSurfaceControls
        activeSurface={activeSurface}
        gazePanelOpen={gazePanelOpen}
        onToggleGazePanel={() => setGazePanelOpen((open) => !open)}
        onOpenDevDrawer={() => setDevDrawerOpen(true)}
      />
      {gazePanelOpen ? (
        <div className="surface-panel-elevated no-drag fixed right-4 top-16 z-50 w-[360px] max-w-[calc(100vw-32px)] p-2">
          <GazeSettingsPanel />
        </div>
      ) : null}
      <FoundationCommandBar />
      {import.meta.env.DEV ? (
        <DevDrawer open={devDrawerOpen} onOpenChange={setDevDrawerOpen} activeSurfaceId={activeSurfaceId} />
      ) : null}
    </main>
  );
}
