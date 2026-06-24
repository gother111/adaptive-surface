import { initialCalibration } from "@/gaze/config";
import { ProviderEvents } from "@/gaze/providers/ProviderEvents";
import type {
  GazeCalibrationState,
  GazeObservation,
  GazeInputProvider,
  GazeProviderStatus,
} from "@/gaze/types";

export class MouseGazeProvider implements GazeInputProvider {
  id = "mouse-simulated" as const;
  label = "Mouse simulation";
  capabilities = {
    requiresCamera: false,
    supportsCalibration: false,
    supportsPause: true,
    supportsConfidence: true,
  };

  private events = new ProviderEvents();
  private status: GazeProviderStatus = "idle";
  private removePointerListener: (() => void) | null = null;
  private sequence = 0;

  getStatus() {
    return this.status;
  }

  async start() {
    if (typeof window === "undefined") {
      this.setStatus("unsupported");
      return;
    }

    this.stopListening();
    this.setStatus("active");

    const onPointerMove = (event: PointerEvent) => {
      if (this.status !== "active") return;
      this.events.emitPoint(createMouseObservation(event.clientX, event.clientY, ++this.sequence));
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    this.removePointerListener = () => window.removeEventListener("pointermove", onPointerMove);
  }

  async stop() {
    this.stopListening();
    this.setStatus("idle");
  }

  async pause() {
    if (this.status === "active") {
      this.setStatus("paused");
    }
  }

  async resume() {
    if (this.status === "paused") {
      this.setStatus("active");
    }
  }

  async calibrate(): Promise<GazeCalibrationState> {
    return initialCalibration;
  }

  subscribe(listener: (observation: GazeObservation) => void) {
    return this.events.subscribe(listener);
  }

  onStatusChange(listener: (status: GazeProviderStatus) => void) {
    return this.events.onStatusChange(listener);
  }

  private stopListening() {
    this.removePointerListener?.();
    this.removePointerListener = null;
  }

  private setStatus(status: GazeProviderStatus) {
    this.status = status;
    this.events.emitStatus(status);
  }
}

function createMouseObservation(viewportX: number, viewportY: number, sequence: number): GazeObservation {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const at = performance.now();

  return {
    sequence,
    capturedAt: at,
    emittedAt: at,
    point: {
      viewportX,
      viewportY,
      normalizedX: clamp(viewportX / width, 0, 1),
      normalizedY: clamp(viewportY / height, 0, 1),
    },
    confidence: 1,
    trackingState: "usable",
    facePresent: null,
    eyesOpen: null,
    source: "mouse-simulated",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
