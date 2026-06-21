import type { HTMLAttributes, ReactNode } from "react";
import { useRegisterGazeTarget } from "@/gaze/react/useRegisterGazeTarget";
import type { GazeTargetMetadata, GazeTargetType } from "@/gaze/types";
import { cn } from "@/lib/utils";

interface GazeTargetProps extends HTMLAttributes<HTMLDivElement> {
  id: string;
  type: GazeTargetType;
  priority?: number;
  disabled?: boolean;
  metadata?: GazeTargetMetadata;
  children: ReactNode;
}

export function GazeTarget({
  id,
  type,
  priority,
  disabled,
  metadata,
  children,
  className,
  ...props
}: GazeTargetProps) {
  const ref = useRegisterGazeTarget<HTMLDivElement>({ id, type, priority, disabled, metadata });

  return (
    <div ref={ref} className={cn("min-w-0", className)} {...props}>
      {children}
    </div>
  );
}
