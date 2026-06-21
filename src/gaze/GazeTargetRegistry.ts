import type { GazeTargetDescriptor } from "@/gaze/types";

export class GazeTargetRegistry {
  private targets = new Map<string, GazeTargetDescriptor>();

  register(target: GazeTargetDescriptor) {
    this.targets.set(target.id, target);
    return () => {
      if (this.targets.get(target.id) === target) {
        this.targets.delete(target.id);
      }
    };
  }

  update(target: GazeTargetDescriptor) {
    this.targets.set(target.id, target);
  }

  unregister(id: string) {
    this.targets.delete(id);
  }

  list() {
    return Array.from(this.targets.values());
  }

  clear() {
    this.targets.clear();
  }
}
