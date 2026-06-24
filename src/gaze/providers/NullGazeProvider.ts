import { initialCalibration } from "@/gaze/config";
import { ProviderEvents } from "@/gaze/providers/ProviderEvents";
import type {
  GazeCalibrationState,
  GazeObservation,
  GazeInputProvider,
  GazeProviderStatus,
} from "@/gaze/types";

export class NullGazeProvider implements GazeInputProvider {
  id = "off" as const;
  label = "Off";
  capabilities = {
    requiresCamera: false,
    supportsCalibration: false,
    supportsPause: false,
    supportsConfidence: false,
  };

  private events = new ProviderEvents();
  private status: GazeProviderStatus = "idle";

  getStatus() {
    return this.status;
  }

  async start() {
    this.setStatus("idle");
  }

  async stop() {
    this.setStatus("idle");
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

  private setStatus(status: GazeProviderStatus) {
    this.status = status;
    this.events.emitStatus(status);
  }
}
