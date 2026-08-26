import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export function ItemQuantityPicker({
  value,
  onChange,
}: ItemQuantityPickerProps) {
  function setQuantity(itemType: RentalItemType, quantity: number) {
    onChange({ ...value, [itemType]: quantity });
  }

  return (
    <ul className="flex flex-col gap-3">
      {RENTAL_ITEM_TYPES.map((itemType) => {
        const label = rentalItemTypeLabel(itemType);
        const quantity = value[itemType];

        return (
          <li
            key={itemType}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <span className="font-medium">{label}</span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Quitar un ${label.toLowerCase()}`}
                disabled={quantity <= 0}
                onClick={() => setQuantity(itemType, Math.max(0, quantity - 1))}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span
                className="w-6 text-center text-lg font-semibold"
                aria-label={`Cantidad de ${label.toLowerCase()}`}
              >
                {quantity}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Agregar un ${label.toLowerCase()}`}
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
