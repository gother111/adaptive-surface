import { History, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
  const [contextOpen, setContextOpen] = useStoredBoolean("adaptive-surface.context-rail-open", true);
  const [inspectorOpen, setInspectorOpen] = useStoredBoolean("adaptive-surface.inspector-rail-open", Boolean(rightRail.length));
  const modeLabel = modeToOccupation(session.mode, Boolean(mainSurface), Boolean(bottomDock.length));

  useEffect(() => {
    if (rightRail.length) {
      setInspectorOpen(true);
    }
  }, [rightRail.length, setInspectorOpen]);

  return (
    <section className="grid h-screen min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden px-4 pb-40 pt-16 sm:px-5 lg:px-6">
      <ContinuityBar
        goal={session.currentGoal}
        modeLabel={modeLabel}
        historyCount={session.transcriptHistory.length}
        contextOpen={contextOpen}
        inspectorOpen={inspectorOpen}
        onToggleContext={() => setContextOpen(!contextOpen)}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
      />
      <div
        className="adaptive-workspace-grid mx-auto h-full w-full max-w-[1680px]"
        data-context={contextOpen ? "open" : "closed"}
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        <Rail
          title="Context"
          description="Sources, constraints, and pinned work"
          emptyLabel="No supporting context is pinned yet."
          zone="context"
          surfaces={leftRail}
          renderSurface={renderSurface}
        />
        <main data-zone="stage" className="no-drag min-h-0">
          <StageViewport surface={mainSurface} renderSurface={renderSurface} />
        </main>
        <Rail
          title="Inspector"
          description="Why, assumptions, and next action"
          emptyLabel="Inspector stays quiet until details or approval matter."
          zone="inspector"
          surfaces={rightRail}
          renderSurface={renderSurface}
        />
        {bottomDock.length ? (
          <div data-zone="interaction" className="no-drag grid max-h-52 gap-3 overflow-auto xl:col-span-full xl:grid-cols-2">
            {bottomDock.map((surface) => (
              <div key={surface.id}>{renderSurface(surface)}</div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ContinuityBar({
  goal,
  modeLabel,
  historyCount,
  contextOpen,
  inspectorOpen,
  onToggleContext,
  onToggleInspector,
}: {
  goal: string | null;
  modeLabel: string;
  historyCount: number;
  contextOpen: boolean;
  inspectorOpen: boolean;
  onToggleContext: () => void;
  onToggleInspector: () => void;
}) {
  return (
    <header className="no-drag mx-auto mb-3 flex w-full max-w-[1680px] items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-1/70 px-3 py-2 shadow-[var(--shadow-surface)] backdrop-blur-md">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{goal ?? "Ready for a surface"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs surface-muted-text">
          <span>{modeLabel}</span>
          <span aria-hidden="true">/</span>
          <span>Local-first scope</span>
          <span aria-hidden="true">/</span>
          <span className="inline-flex items-center gap-1">
            <History className="size-3" />
            {historyCount} checkpoints
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="surface-segmented-item"
          aria-label={contextOpen ? "Collapse context rail" : "Open context rail"}
          aria-pressed={contextOpen}
          onClick={onToggleContext}
        >
          {contextOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        <button
          type="button"
          className="surface-segmented-item"
          aria-label={inspectorOpen ? "Collapse inspector rail" : "Open inspector rail"}
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </button>
      </div>
    </header>
  );
}

function StageViewport({
  surface,
  renderSurface,
}: {
  surface: SurfaceInstance | undefined;
  renderSurface: (surface: SurfaceInstance) => ReactNode;
}) {
  if (!surface) {
    return (
      <div className="surface-panel grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium">Stage is reserved</p>
          <p className="mt-2 text-sm leading-6 surface-muted-text">
            The primary artifact will render here without moving context or inspector regions.
          </p>
        </div>
      </div>
    );
  }

  return <div className="h-full min-h-0 motion-structural">{renderSurface(surface)}</div>;
}

function Rail({
  surfaces,
  renderSurface,
  title,
  description,
  emptyLabel,
  zone,
}: {
  surfaces: SurfaceInstance[];
  renderSurface: (surface: SurfaceInstance) => ReactNode;
  title: string;
  description: string;
  emptyLabel: string;
  zone: "context" | "inspector";
}) {
  return (
    <aside data-zone={zone} className="no-drag min-h-0 flex-col gap-3 overflow-auto pr-1">
      <div className="surface-panel p-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs leading-5 surface-muted-text">{description}</p>
      </div>
      {surfaces.length ? (
        surfaces.map((surface) => (
          <div key={surface.id}>{renderSurface(surface)}</div>
        ))
      ) : (
        <div className="surface-subpanel p-3 text-xs leading-5 surface-muted-text">{emptyLabel}</div>
      )}
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

function modeToOccupation(mode: WorkspaceSession["mode"], hasStage: boolean, hasCommit: boolean) {
  if (hasCommit) return "Commit boundary";
  if (!hasStage) return "Ambient";
  if (mode === "researching") return "Focus / research";
  if (mode === "drafting" || mode === "composing") return "Focus / composing";
  if (mode === "reviewing") return "Review";
  return "Focus";
}

function useStoredBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = globalThis.window?.localStorage.getItem(key);
      if (stored === "true") return true;
      if (stored === "false") return false;
    } catch {
      return initialValue;
    }

    return initialValue;
  });

  useEffect(() => {
    try {
      globalThis.window?.localStorage.setItem(key, String(value));
    } catch {
      // Local storage can be unavailable in restricted WebView contexts.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
