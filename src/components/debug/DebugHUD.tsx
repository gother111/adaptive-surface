import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function DebugHUD() {
  const open = useSurfaceStore((state) => state.debugHudOpen);
  const setOpen = useSurfaceStore((state) => state.setDebugHudOpen);
  const activeIntent = useSurfaceStore((state) => state.activeIntent);
  const partialTranscript = useSurfaceStore((state) => state.partialTranscript);
  const committedTranscript = useSurfaceStore((state) => state.committedTranscript);
  const transcript = useSurfaceStore((state) => state.transcript);
  const activeSession = useSurfaceStore((state) => state.activeSession);
  const emittedPatches = useSurfaceStore((state) => state.emittedPatches);
  const workspaceSession = useSurfaceStore((state) => state.workspaceSession);
  const workspacePatches = useSurfaceStore((state) => state.workspacePatches);
  const lastRoutedAction = useSurfaceStore((state) => state.lastRoutedAction);
  const activeObjectiveId = useSurfaceStore((state) => state.activeObjectiveId);
  const objectives = useSurfaceStore((state) => state.objectives);
  const lastObjectiveRoutingDecision = useSurfaceStore((state) => state.lastObjectiveRoutingDecision);
  const workObjects = useSurfaceStore((state) => state.workObjects);
  const relevantContextObjectIds = useSurfaceStore((state) => state.relevantContextObjectIds);
  const lastCapabilityAction = useSurfaceStore((state) => state.lastCapabilityAction);
  const lastApprovalRequired = useSurfaceStore((state) => state.lastApprovalRequired);
  const appleContext = useSurfaceStore((state) => state.appleContext);
  const lastGoldenEvalStatus = useSurfaceStore((state) => state.lastGoldenEvalStatus);
  const activeObjective = objectives.find((objective) => objective.id === activeObjectiveId) ?? null;
  const relevantContextObjects = relevantContextObjectIds
    .map((id) => workObjects[id])
    .filter(Boolean)
    .map((object) => ({ id: object.id, kind: object.kind, title: object.title, source: object.source }));

  if (!open) {
    return null;
  }

  return (
    <aside className="surface-panel-elevated fixed bottom-5 right-5 z-50 flex h-[min(620px,calc(100vh-40px))] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Debug HUD</h2>
          <p className="mt-1 text-xs text-muted-foreground">Intent, transcript, session, patches</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Hide debug HUD">
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4 text-xs">
          <DebugBlock title="Intent">
            <div>{activeIntent?.title ?? "None"}</div>
            <div className="text-muted-foreground">confidence: {activeIntent ? `${Math.round(activeIntent.confidence * 100)}%` : "n/a"}</div>
            <div className="text-muted-foreground">rationale: {activeIntent?.rationale ?? "n/a"}</div>
          </DebugBlock>

          <DebugBlock title="Transcript">
            <div className="text-primary">partial: {partialTranscript || "none"}</div>
            <div className="text-muted-foreground">committed: {committedTranscript || "none"}</div>
            <div className="mt-2 space-y-1">
              {transcript.slice(0, 6).map((entry) => (
                <div key={entry.id} className="surface-row p-2">
                  <span className={entry.status === "partial" ? "text-primary" : "text-foreground"}>{entry.status}</span>
                  <span className="ml-2 text-muted-foreground">{entry.text}</span>
                </div>
              ))}
            </div>
          </DebugBlock>

          <DebugBlock title="Active session">
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(activeSession, null, 2)}
            </pre>
          </DebugBlock>

          <DebugBlock title="Routed action">
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(lastRoutedAction, null, 2)}
            </pre>
          </DebugBlock>

          <DebugBlock title="Objective">
            <div>activeObjectiveId: {activeObjectiveId ?? "none"}</div>
            <div className="text-muted-foreground">kind: {activeObjective?.kind ?? "n/a"}</div>
            <div className="text-muted-foreground">status: {activeObjective?.status ?? "n/a"}</div>
            <div className="text-muted-foreground">routing: {lastObjectiveRoutingDecision?.route ?? "n/a"}</div>
            <div className="text-muted-foreground">reason: {lastObjectiveRoutingDecision?.reason ?? "n/a"}</div>
          </DebugBlock>

          <DebugBlock title="Work data">
            <div>WorkObjects: {Object.keys(workObjects).length}</div>
            <div className="text-muted-foreground">Relevant context: {relevantContextObjectIds.length}</div>
            <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(relevantContextObjects, null, 2)}
            </pre>
          </DebugBlock>

          <DebugBlock title="Capability / approval">
            <div>last capability: {lastCapabilityAction ?? "none"}</div>
            <div className="text-muted-foreground">approval required: {lastApprovalRequired ? "yes" : "no"}</div>
            <div className="text-muted-foreground">golden eval: {lastGoldenEvalStatus ?? "not run in app"}</div>
          </DebugBlock>

          <DebugBlock title="Apple context">
            <div>loading: {appleContext.loading ? "yes" : "no"}</div>
            <div className="text-muted-foreground">lastSyncedAt: {appleContext.lastSyncedAt ?? "never"}</div>
            <div className="text-muted-foreground">
              mail {appleContext.mailMessages.length} | calendar {appleContext.calendarEvents.length} | notes {appleContext.notes.length}
            </div>
            <div className="text-muted-foreground">error: {appleContext.error ?? "none"}</div>
          </DebugBlock>

          <DebugBlock title="Workspace session">
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(workspaceSession, null, 2)}
            </pre>
          </DebugBlock>

          <DebugBlock title="Workspace patches">
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(workspacePatches, null, 2)}
            </pre>
          </DebugBlock>

          <DebugBlock title="Legacy patches">
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(emittedPatches, null, 2)}
            </pre>
          </DebugBlock>
        </div>
      </ScrollArea>
    </aside>
  );
}

function DebugBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-subpanel p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
