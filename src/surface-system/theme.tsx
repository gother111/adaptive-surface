import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "adaptive-surface.theme";

const themePreferences: ThemePreference[] = ["system", "light", "dark"];

export interface ThemeController {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeController | null>(null);

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && themePreferences.includes(value as ThemePreference);
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}

export function readThemePreference(storage: Storage | undefined): ThemePreference {
  if (!storage) return "system";

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(storage: Storage | undefined, preference: ThemePreference) {
  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable in restricted WebView contexts.
  }
}

export function getSystemTheme(win: Window | undefined): ResolvedTheme {
  if (!win?.matchMedia) return "dark";
  return win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToDocument(
  doc: Document | undefined,
  preference: ThemePreference,
  resolvedTheme: ResolvedTheme,
) {
  if (!doc) return;

  const root = doc.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.toggle("light", resolvedTheme === "light");
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readThemePreference(globalThis.window?.localStorage),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme(globalThis.window));
  const resolvedTheme = resolveThemePreference(preference, systemTheme);

  useEffect(() => {
    const media = globalThis.window?.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;

    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyThemeToDocument(globalThis.document, preference, resolvedTheme);
    writeThemePreference(globalThis.window?.localStorage, preference);
  }, [preference, resolvedTheme]);

  const value = useMemo<ThemeController>(
    () => ({
      preference,
      resolvedTheme,
      setPreference: setPreferenceState,
    }),
    [preference, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const controller = useContext(ThemeContext);
  if (!controller) {
    throw new Error("useThemePreference must be used inside ThemePreferenceProvider");
  }

  return controller;
}
