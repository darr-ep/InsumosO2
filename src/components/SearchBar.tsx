import { Input } from "@/components/ui/input";

/**
 * SDD.md §7.4/§16.9 ("un único campo de búsqueda") + CU3. Purely
 * presentational — `SearchScreen` (task 2.6) owns the debounce and the
 * actual `searchRentals` call.
 */

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <Input
      aria-label="Buscar por folio, nombre o teléfono"
      placeholder="Folio, nombre o teléfono"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
