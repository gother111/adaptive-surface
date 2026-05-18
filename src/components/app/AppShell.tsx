import { useState } from "react";
import { DevDrawer } from "@/components/app/DevDrawer";
import { FloatingSurfaceControls } from "@/components/app/FloatingSurfaceControls";
import { FoundationCommandBar } from "@/components/command/FoundationCommandBar";
import { WorkspaceStage } from "@/components/workspace/WorkspaceStage";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function AppShell() {
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);
  const activeSurfaceId = useSurfaceStore((state) => state.activeSurfaceId);
  const surfaces = useSurfaceStore((state) => state.surfaces);
  const draftSurface = useSurfaceStore((state) => state.draftSurface);
  const workspaceSession = useSurfaceStore((state) => state.workspaceSession);
  const activeSurface =
    draftSurface && activeSurfaceId === draftSurface.id
      ? draftSurface
      : surfaces.find((surface) => surface.id === activeSurfaceId) ?? null;

  return (
    <main className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_18%,var(--surface-glow),transparent_28%),linear-gradient(135deg,oklch(0.095_0.017_255),oklch(0.13_0.021_255)_48%,oklch(0.085_0.015_255))]">
      <WorkspaceStage session={workspaceSession} />
      <FloatingSurfaceControls
        activeSurface={activeSurface}
        onOpenDevDrawer={() => setDevDrawerOpen(true)}
      />
      <FoundationCommandBar />
      {import.meta.env.DEV ? (
        <DevDrawer open={devDrawerOpen} onOpenChange={setDevDrawerOpen} activeSurfaceId={activeSurfaceId} />
      ) : null}
    </main>
  );
}
