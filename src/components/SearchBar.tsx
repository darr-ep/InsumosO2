import { Input } from "@/components/ui/input";

/**
 * SDD.md §7.4/§16.9 ("un único campo de búsqueda") + CU3. Purely
 * presentational — `SearchScreen` (task 2.6) owns the debounce and the
 * actual `searchRentals` call.
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
    <Input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-0 bg-muted/70 shadow-none rounded-full px-4 focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  );
}
