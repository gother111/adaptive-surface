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

  if (!open) {
    return null;
  }

  return (
    <aside className="fixed bottom-5 right-5 z-50 flex h-[min(620px,calc(100vh-40px))] w-[420px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-popover/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
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
                <div key={entry.id} className="rounded-md border border-white/10 bg-white/[0.035] p-2">
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
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
