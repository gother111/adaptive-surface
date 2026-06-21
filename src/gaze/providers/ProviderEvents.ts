import type { GazePoint, GazeProviderStatus } from "@/gaze/types";

export class ProviderEvents {
  private pointListeners = new Set<(point: GazePoint) => void>();
  private statusListeners = new Set<(status: GazeProviderStatus) => void>();

  subscribe(listener: (point: GazePoint) => void) {
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

  emitPoint(point: GazePoint) {
    this.pointListeners.forEach((listener) => listener(point));
  }

  emitStatus(status: GazeProviderStatus) {
    this.statusListeners.forEach((listener) => listener(status));
  }
}
