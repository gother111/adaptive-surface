import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemePreference, type ThemePreference } from "@/surface-system/theme";

const options: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

export function ThemeControls() {
  const { preference, setPreference } = useThemePreference();

  return (
    <div className="surface-segmented" aria-label="Theme preference">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === preference;

        return (
          <button
            key={option.value}
            type="button"
            className={cn("surface-segmented-item", selected && "surface-segmented-item-selected")}
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => setPreference(option.value)}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
