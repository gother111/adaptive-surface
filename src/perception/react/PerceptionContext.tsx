import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { perceptionRuntime } from "@/perception/PerceptionRuntime";
import type { PerceptionSnapshot } from "@/perception/types";

interface PerceptionContextValue extends PerceptionSnapshot {
  setHandGesturesEnabled: (enabled: boolean) => Promise<void>;
  startHandTracking: () => Promise<void>;
  stopHandTracking: () => Promise<void>;
  cancelPerceptionIntent: () => void;
}

export const PerceptionContext = createContext<PerceptionContextValue | null>(null);

export function PerceptionProviderRoot({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PerceptionSnapshot>(() => perceptionRuntime.getSnapshot());

  useEffect(() => {
    const unsubscribe = perceptionRuntime.subscribe(setSnapshot);
    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo<PerceptionContextValue>(() => ({
    ...snapshot,
    setHandGesturesEnabled: (enabled) => perceptionRuntime.setHandGesturesEnabled(enabled),
    startHandTracking: () => perceptionRuntime.startHandTracking(),
    stopHandTracking: () => perceptionRuntime.stopHandTracking(),
    cancelPerceptionIntent: () => perceptionRuntime.cancel("timeout"),
  }), [snapshot]);

  return (
    <PerceptionContext.Provider value={value}>
      {children}
      <PerceptionIntentReceipt />
    </PerceptionContext.Provider>
  );
}

function PerceptionIntentReceipt() {
  const [snapshot, setSnapshot] = useState<PerceptionSnapshot>(() => perceptionRuntime.getSnapshot());

  useEffect(() => {
    const unsubscribe = perceptionRuntime.subscribe(setSnapshot);
    return () => {
      unsubscribe();
    };
  }, []);

  const intent = snapshot.lastIntent;
  if (!intent || intent.kind === "drag-target") return null;

  const label = intent.kind === "confirm-target"
    ? `Confirmed: ${intent.target.metadata?.label ?? intent.target.id}`
    : intent.kind === "navigate"
      ? `Navigate ${intent.direction}`
      : `Cancelled: ${intent.source}`;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 rounded-md border border-border bg-popover/90 px-3 py-2 text-xs text-popover-foreground shadow-xl backdrop-blur-xl">
      {label}
    </div>
  );
}
