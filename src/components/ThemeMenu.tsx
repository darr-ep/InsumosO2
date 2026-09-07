import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
];

/**
 * 3-state theme switch (Claro/Oscuro/Sistema), same header-icon-dropdown
 * pattern as `AccountMenu`/`PrinterMenu` for visual consistency. The
 * trigger's own icon reflects the CURRENT EFFECTIVE theme (sun/moon), not
 * literally "system" — a monitor glyph would tell the user nothing about
 * what they're actually looking at right now.
 */
export function ThemeMenu() {
  const [preference, effective, setPreference] = useThemePreference();
  const TriggerIcon = effective === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Tema"
          className="rounded-full"
        >
          <TriggerIcon aria-hidden="true" className="!size-[24px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => {
          const isSelected = preference === value;
          return (
            // Radix's shared DropdownMenuItem wrapper was deliberately
            // trimmed to skip Radio/Checkbox variants (no prior use case) —
            // rather than restructure that shared primitive for this one
            // caller, override the a11y role/state directly so a
            // screen-reader user can tell which of the 3 modes is active,
            // same information the visual checkmark already conveys.
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={isSelected}
              onSelect={() => setPreference(value)}
            >
              <Icon aria-hidden="true" />
              {label}
              {isSelected && <Check aria-hidden="true" className="ml-auto" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
