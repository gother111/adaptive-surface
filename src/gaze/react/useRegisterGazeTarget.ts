import { useLayoutEffect, useMemo, useRef } from "react";
import { gazeManager } from "@/gaze/GazeManager";
import type { GazeTargetDescriptor, GazeTargetMetadata, GazeTargetType } from "@/gaze/types";

export interface UseRegisterGazeTargetOptions {
  id: string;
  type: GazeTargetType;
  priority?: number;
  disabled?: boolean;
  metadata?: GazeTargetMetadata;
}

export function useRegisterGazeTarget<TElement extends HTMLElement>({
  id,
  type,
  priority,
  disabled,
  metadata,
}: UseRegisterGazeTargetOptions) {
  const ref = useRef<TElement | null>(null);
  const metadataKey = JSON.stringify(metadata ?? {});

  const descriptor = useMemo<GazeTargetDescriptor>(() => ({
    id,
    type,
    priority,
    disabled,
    metadata,
    getRect: () => ref.current?.getBoundingClientRect() ?? null,
  }), [id, type, priority, disabled, metadataKey]);

  useLayoutEffect(() => gazeManager.registry.register(descriptor), [descriptor]);

  return ref;
}
