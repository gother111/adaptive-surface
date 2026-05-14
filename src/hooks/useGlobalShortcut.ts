import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/lib/tauri";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

const SHORTCUT = "CommandOrControl+Shift+Space";

export function useGlobalShortcut() {
  const toggleListeningRequested = useSurfaceStore((state) => state.toggleListeningRequested);

  useEffect(() => {
    function handleLocalShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        toggleListeningRequested();
      }
    }

    window.addEventListener("keydown", handleLocalShortcut);

    if (!isTauriRuntime()) {
      return () => window.removeEventListener("keydown", handleLocalShortcut);
    }

    let disposed = false;

    async function registerShortcut() {
      const { isRegistered, register, unregister } = await import("@tauri-apps/plugin-global-shortcut");

      if (await isRegistered(SHORTCUT)) {
        await unregister(SHORTCUT);
      }

      await register(SHORTCUT, async (event) => {
        if (event.state !== "Pressed") {
          return;
        }

        const appWindow = getCurrentWindow();
        await appWindow.show();
        await appWindow.unminimize();
        await appWindow.setFocus();
        toggleListeningRequested();
      });

      return async () => {
        if (!disposed && (await isRegistered(SHORTCUT))) {
          await unregister(SHORTCUT);
        }
      };
    }

    const cleanup = registerShortcut().catch((error) => {
      console.error("Failed to register global shortcut", error);
    });

    return () => {
      window.removeEventListener("keydown", handleLocalShortcut);
      disposed = true;
      void cleanup.then((unregister) => unregister?.());
    };
  }, [toggleListeningRequested]);
}
