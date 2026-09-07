import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RENTAL_ITEM_TYPES,
  rentalItemTypeLabel,
  type RentalItemType,
} from "@/domain/rentals/rental";

/**
 * SDD.md §7.1 ("Seleccionar productos + cantidades") + §16.7 (Qué se
 * renta → Cantidad). Only two product types exist (§34 — no inventory
 * catalog), so this is a fixed pair of steppers, not a dynamic list.
 */

export type ItemQuantities = Record<RentalItemType, number>;

// eslint-disable-next-line react-refresh/only-export-components -- shared constant, tightly coupled to this component's value shape; not worth a separate file.
export const emptyItemQuantities: ItemQuantities = {
  concentrator: 0,
  tank: 0,
};

export interface ItemQuantityPickerProps {
  value: ItemQuantities;
  onChange: (value: ItemQuantities) => void;
  invalid?: boolean;
}

export function ItemQuantityPicker({
  value,
  onChange,
  invalid = false,
}: ItemQuantityPickerProps) {
  function setQuantity(itemType: RentalItemType, quantity: number) {
    onChange({ ...value, [itemType]: quantity });
  }

  return (
    <ul className="flex flex-col gap-2">
      {RENTAL_ITEM_TYPES.map((itemType) => {
        const label = rentalItemTypeLabel(itemType);
        const quantity = value[itemType];

        return (
          <li
            key={itemType}
            className={cn(
              "bg-card flex items-center justify-between rounded-2xl border p-3.5 shadow-xs",
              invalid && "border-destructive",
            )}
          >
            <span className="font-semibold text-foreground">{label}</span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Quitar un ${label.toLowerCase()}`}
                disabled={quantity <= 0}
                className={cn(
                  "rounded-full size-9",
                  quantity > 0 && "border-primary text-primary hover:bg-primary/10",
                )}
                onClick={() => setQuantity(itemType, Math.max(0, quantity - 1))}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span
                className="w-6 text-center text-lg font-bold text-foreground"
                aria-label={`Cantidad de ${label.toLowerCase()}`}
              >
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Agregar un ${label.toLowerCase()}`}
                className="rounded-full size-9 border-primary text-primary hover:bg-primary/10"
                onClick={() => setQuantity(itemType, quantity + 1)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Converts the picker's per-type quantity map into the flat list the
// rental form/domain schema (task 1.5) and rentals.repo (task 1.4) expect
// — types with quantity 0 are simply not "selected products".
// eslint-disable-next-line react-refresh/only-export-components -- shared helper, tightly coupled to this component's value shape; not worth a separate file.
export function itemQuantitiesToList(
  quantities: ItemQuantities,
): { itemType: RentalItemType; quantity: number }[] {
  return RENTAL_ITEM_TYPES.filter((itemType) => quantities[itemType] > 0).map(
    (itemType) => ({ itemType, quantity: quantities[itemType] }),
  );
}
