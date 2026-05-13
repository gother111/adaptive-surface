import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/lib/tauri";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

const SHORTCUT = "CommandOrControl+Shift+Space";

export function useGlobalShortcut() {
  const setCommandOpen = useSurfaceStore((state) => state.setCommandOpen);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
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
        setCommandOpen(true);
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
      disposed = true;
      void cleanup.then((unregister) => unregister?.());
    };
  }, [setCommandOpen]);
}
