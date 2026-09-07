import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * SDD.md §7.4/§16.9 ("un único campo de búsqueda") + CU3. Purely
 * presentational — the caller owns the debounce and the actual search call.
 *
 * Redesign — UX/UI pass: added a leading magnifying-glass icon — the
 * placeholder text alone wasn't as instantly recognizable as "search" as
 * the icon is.
 *
 * Post-launch polish: trailing clear ("×") button, shown only once there's
 * text — a real `<button>` (not a decorative div) so it's keyboard/screen-
 * reader reachable, `pr-10` instead of `pr-4` only while it's rendered so
 * typed text never sits underneath it.
 */

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Folio, nombre o teléfono",
  ariaLabel = "Buscar por folio, nombre o teléfono",
}: SearchBarProps) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
      />
      <Input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "border border-input bg-card shadow-xs rounded-full pl-10 focus-visible:ring-1 focus-visible:ring-ring/30",
          value ? "pr-10" : "pr-4",
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
