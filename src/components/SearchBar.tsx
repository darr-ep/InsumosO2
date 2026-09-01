import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * SDD.md §7.4/§16.9 ("un único campo de búsqueda") + CU3. Purely
 * presentational — `SearchScreen` (task 2.6) owns the debounce and the
 * actual `searchRentals` call.
 *
 * Redesign — UX/UI pass: added a leading magnifying-glass icon — the
 * placeholder text alone wasn't as instantly recognizable as "search" as
 * the icon is.
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
        className="border-0 bg-muted/70 shadow-none rounded-full pr-4 pl-10 focus-visible:ring-1 focus-visible:ring-ring/30"
      />
    </div>
  );
}
