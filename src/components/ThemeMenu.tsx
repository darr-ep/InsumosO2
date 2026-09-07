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
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setPreference(value)}>
            <Icon aria-hidden="true" />
            {label}
            {preference === value && (
              <Check aria-hidden="true" className="ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
