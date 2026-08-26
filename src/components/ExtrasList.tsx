import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RentalExtraFormValues } from "@/domain/rentals/rental";

/**
 * SDD.md §7.1 ("agregar 'Otros'") + §11.2/§11.3 (texto + precio, nunca
 * inventario) + §16.7 (sección "Otros"). Free-form concept + price rows,
 * shown on the receipt (§22) only — never persisted as anything but
 * `rentals.extras` json (task 1.4/1.5).
 */

export interface ExtrasListProps {
  value: RentalExtraFormValues[];
  onChange: (value: RentalExtraFormValues[]) => void;
}

export function ExtrasList({ value, onChange }: ExtrasListProps) {
  function addRow() {
    onChange([...value, { description: "", price: 0 }]);
  }

  function updateRow(index: number, patch: Partial<RentalExtraFormValues>) {
    onChange(
      value.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((row, index) => (
        <div
          // Rows have no stable id, only their position — fine for a
          // short, append/remove-only list with no reordering.
          key={index}
          className="flex items-end gap-2"
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`extra-description-${index}`}>Concepto</Label>
            <Input
              id={`extra-description-${index}`}
              placeholder="Ej. 2 cubrebocas KF94"
              value={row.description}
              onChange={(event) =>
                updateRow(index, { description: event.target.value })
              }
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor={`extra-price-${index}`}>Precio</Label>
            <Input
              id={`extra-price-${index}`}
              type="number"
              min={0}
              inputMode="decimal"
              value={row.price}
              onChange={(event) =>
                updateRow(index, { price: Number(event.target.value) })
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Quitar este concepto"
            onClick={() => removeRow(index)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addRow}>
        Agregar otro concepto
      </Button>
    </div>
  );
}
