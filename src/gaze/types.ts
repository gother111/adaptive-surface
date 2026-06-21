export type GazeProviderId = "off" | "mouse-simulated" | "webgazer" | "webeyetrack-placeholder";

export type GazeProviderStatus =
  | "idle"
  | "starting"
  | "calibrating"
  | "active"
  | "paused"
  | "poor-tracking"
  | "permission-denied"
  | "unsupported"
  | "error";

export type GazePointSource = "mouse-simulated" | "webgazer" | "webeyetrack-placeholder";

export interface GazePoint {
  viewportX: number;
  viewportY: number;
  normalizedX: number;
  normalizedY: number;
  confidence: number;
  timestamp: number;
  source: GazePointSource;
  raw?: unknown;
}

export interface SmoothedGazePoint extends GazePoint {
  velocityPxPerMs?: number;
  isFixating: boolean;
  fixationStartedAt?: number;
}

export type GazeTargetType =
  | "surface"
  | "surface-region"
  | "card"
  | "button"
  | "document"
  | "document-paragraph"
  | "table"
  | "table-cell"
  | "person"
  | "file"
  | "app"
  | "command"
  | "unknown";

export interface GazeTargetMetadata {
  label?: string;
  sourceApp?: string;
  entityId?: string;
  actionHints?: string[];
  [key: string]: unknown;
}

export interface GazeTargetDescriptor {
  id: string;
  type: GazeTargetType;
  priority?: number;
  disabled?: boolean;
  getRect: () => DOMRect | null;
  metadata?: GazeTargetMetadata;
}

export interface ResolvedGazeTarget {
  id: string;
  type: GazeTargetType;
  confidence: number;
  dwellMs: number;
  rect: DOMRect;
  metadata?: GazeTargetMetadata;
  resolvedAt: number;
}

export interface GazeCalibrationSample {
  targetX: number;
  targetY: number;
  measuredX?: number;
  measuredY?: number;
  timestamp: number;
}

export interface GazeCalibrationState {
  status: "not-calibrated" | "in-progress" | "complete" | "failed";
  sampleCount: number;
  validationErrorPx?: number;
  quality: "unknown" | "poor" | "fair" | "good";
  completedAt?: number;
}

export interface GazeProviderCapabilities {
  requiresCamera: boolean;
  supportsCalibration: boolean;
  supportsPause: boolean;
  supportsConfidence: boolean;
  supportsRawDebug?: boolean;
}

export interface GazeStartOptions {
  showPreview?: boolean;
  debug?: boolean;
  persistCalibration?: boolean;
}

export interface GazeCalibrationOptions {
  pointCount?: 5 | 9 | 13 | 25;
  requireClicks?: boolean;
  showInstructions?: boolean;
}

export interface GazeInputProvider {
  id: GazeProviderId;
  label: string;
  capabilities: GazeProviderCapabilities;
  getStatus(): GazeProviderStatus;
  start(options?: GazeStartOptions): Promise<void>;
  stop(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  calibrate?(options?: GazeCalibrationOptions): Promise<GazeCalibrationState>;
  recordCalibrationSample?(sample: GazeCalibrationSample): void | Promise<void>;
  clearCalibration?(): Promise<void>;
  subscribe(listener: (point: GazePoint) => void): () => void;
  onStatusChange?(listener: (status: GazeProviderStatus) => void): () => void;
}

export interface GazeSettings {
  providerId: GazeProviderId;
  showFocusRing: boolean;
  showDebugHud: boolean;
}

export interface GazeSnapshot {
  providerId: GazeProviderId;
  status: GazeProviderStatus;
  latestPoint: GazePoint | null;
  smoothedPoint: SmoothedGazePoint | null;
  currentTarget: ResolvedGazeTarget | null;
  calibration: GazeCalibrationState;
  settings: GazeSettings;
  lastError: string | null;
}

export interface AttentionContext {
  target: ResolvedGazeTarget | null;
  source: "gaze" | "pointer" | "keyboard" | "none";
  confidence: number;
}
