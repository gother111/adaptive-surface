import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  isThemePreference,
  readThemePreference,
  resolveThemePreference,
  writeThemePreference,
} from "@/surface-system/theme";

function createStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("theme preference", () => {
  it("resolves system preference without treating it as a separate rendered theme", () => {
    expect(resolveThemePreference("system", "dark")).toBe("dark");
    expect(resolveThemePreference("system", "light")).toBe("light");
    expect(resolveThemePreference("dark", "light")).toBe("dark");
  });

  it("guards stored values and persists only known preferences", () => {
    const storage = createStorage({ [THEME_STORAGE_KEY]: "neon" });
    expect(readThemePreference(storage)).toBe("system");
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("neon")).toBe(false);

    writeThemePreference(storage, "light");
    expect(readThemePreference(storage)).toBe("light");
  });
});
