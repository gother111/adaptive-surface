import type { GazeObservation, GazeProviderStatus } from "@/gaze/types";

export class ProviderEvents {
  private pointListeners = new Set<(observation: GazeObservation) => void>();
  private statusListeners = new Set<(status: GazeProviderStatus) => void>();

  subscribe(listener: (observation: GazeObservation) => void) {
    this.pointListeners.add(listener);
    return () => {
      this.pointListeners.delete(listener);
    };
  }

  onStatusChange(listener: (status: GazeProviderStatus) => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  emitPoint(observation: GazeObservation) {
    this.pointListeners.forEach((listener) => listener(observation));
  }

  emitStatus(status: GazeProviderStatus) {
    this.statusListeners.forEach((listener) => listener(status));
  }
}
