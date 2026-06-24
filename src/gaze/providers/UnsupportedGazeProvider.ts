import { initialCalibration } from "@/gaze/config";
import { ProviderEvents } from "@/gaze/providers/ProviderEvents";
import type {
  GazeCalibrationState,
  GazeObservation,
  GazeInputProvider,
  GazeProviderId,
  GazeProviderStatus,
} from "@/gaze/types";

export class UnsupportedGazeProvider implements GazeInputProvider {
  capabilities = {
    requiresCamera: false,
    supportsCalibration: false,
    supportsPause: false,
    supportsConfidence: false,
  };

  private events = new ProviderEvents();
  private status: GazeProviderStatus = "idle";

  constructor(
    readonly id: GazeProviderId,
    readonly label: string,
  ) {}

  getStatus() {
    return this.status;
  }

  async start() {
    this.setStatus("unsupported");
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
