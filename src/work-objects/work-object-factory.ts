import type { WorkObject, WorkObjectBase, WorkObjectKind, WorkObjectSource } from "@/work-objects/work-object-types";

export interface CreateWorkObjectInput {
  kind: WorkObjectKind;
  source: WorkObjectSource;
  title: string;
  subtitle?: string;
  contentPreview?: string;
  rawRef?: string;
  confidence?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

export function createWorkObject(input: CreateWorkObjectInput): WorkObject {
  const now = Date.now();
  const base: WorkObjectBase = {
    id: stableWorkObjectId(input.source, input.kind, input.rawRef ?? input.title),
    kind: input.kind,
    source: input.source,
    title: input.title.trim() || "Untitled work object",
    subtitle: input.subtitle,
    contentPreview: input.contentPreview,
    rawRef: input.rawRef,
    confidence: clampConfidence(input.confidence ?? 0.8),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
    metadata: input.metadata ?? {},
  };

  return base;
}

export function stableWorkObjectId(source: WorkObjectSource, kind: WorkObjectKind, rawRef: string) {
  return `wo_${source}_${kind}_${hashString(rawRef)}`;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
