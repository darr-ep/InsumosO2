import { customerFormSchema } from "@/domain/customers/customer";
import {
  RENTAL_ITEM_TYPES,
  rentalFormSchema,
  type RentalItemType,
} from "@/domain/rentals/rental";

/**
 * design-fidelity D1.1 — pure per-step validation gates for the "Nueva
 * renta" wizard (`RentalNewScreen.tsx`). Extracted so the step-gating logic
 * (which controls whether "Continuar" is enabled) and `handleConfirm`'s
 * final validation can never drift apart — both ultimately check the same
 * Zod schemas.
 *
 * Deliberately domain-layer-pure: no import from `@/components/*` or
 * `@/data/*`. `selectedCustomer`/`pendingNewCustomer` are typed by shape
 * (structural typing), not by importing `CustomerRecord`
 * (`@/data/customers.repo`) or `CustomerFormSubmitValues`
 * (`@/components/CustomerForm`) — both callers' real values are structurally
 * compatible. Likewise `itemQuantities` is typed as the same
 * `Record<RentalItemType, number>` shape `ItemQuantities`
 * (`@/components/ItemQuantityPicker`) already is, without importing that
 * component module. This means the item-list-building step below
 * intentionally duplicates a couple of lines of
 * `itemQuantitiesToList` — a small, acceptable price for keeping this file
 * free of any presentational-layer dependency.
 */

export interface ValidateCustomerStepInput {
  selectedCustomer: { id: string } | null;
  pendingNewCustomer: { name: string; phone: string } | null;
}

// Reuses `customerFormSchema` — the identical check `RentalNewScreen`'s
// `handleConfirm` already ran (and still runs, unchanged) before ever
// calling `createCustomer` for a "Cliente nuevo" draft.
export function validateCustomerStep({
  selectedCustomer,
  pendingNewCustomer,
}: ValidateCustomerStepInput): boolean {
  if (selectedCustomer) {
    return true;
  }
  if (!pendingNewCustomer) {
    return false;
  }
  return customerFormSchema.safeParse({
    name: pendingNewCustomer.name,
    phone: pendingNewCustomer.phone,
  }).success;
}

export interface ValidateItemsStepInput {
  itemQuantities: Record<RentalItemType, number>;
  initialRentAmount: string;
  depositAmount: string;
}

// `.pick()` avoids fabricating a placeholder `customer_id` just to satisfy
// `rentalFormSchema` here — this step never touches the customer.
const itemsStepSchema = rentalFormSchema.pick({
  items: true,
  initial_rent_amount: true,
  deposit_amount: true,
});

export function validateItemsStep({
  itemQuantities,
  initialRentAmount,
  depositAmount,
}: ValidateItemsStepInput): boolean {
  const items = RENTAL_ITEM_TYPES.filter(
    (itemType) => itemQuantities[itemType] > 0,
  ).map((itemType) => ({
    item_type: itemType,
    quantity: itemQuantities[itemType],
  }));

  return itemsStepSchema.safeParse({
    items,
    initial_rent_amount: Number(initialRentAmount || 0),
    deposit_amount: Number(depositAmount || 0),
  }).success;
}
