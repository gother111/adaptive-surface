import { useEffect } from "react";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

export function useDebugShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        useSurfaceStore.getState().toggleDebugHud();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
