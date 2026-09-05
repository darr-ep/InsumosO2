import { z } from "zod";

/**
 * SDD.md §20 (validaciones — renta, capa Zod) + §7.1 (flujo Nueva renta) +
 * §16.7 (orden de campos). Pure rules for the "Nueva renta" form (task
 * 1.8) — folio/status are never part of this schema, they're always
 * server-set (§11.1, §19.1, task 1.2).
 */

export const RENTAL_ITEM_TYPES = ["concentrator", "tank"] as const;
export type RentalItemType = (typeof RENTAL_ITEM_TYPES)[number];

// §16.14: microcopy en español cotidiano, nunca lenguaje técnico.
const RENTAL_ITEM_TYPE_LABELS: Record<RentalItemType, string> = {
  concentrator: "Concentrador",
  tank: "Tanque",
};

export function rentalItemTypeLabel(itemType: RentalItemType): string {
  return RENTAL_ITEM_TYPE_LABELS[itemType];
}

// §16.4: "el estado se comunica primero con texto, el color es refuerzo" —
// `RentalStatusBadge` (task 3.3, §17) always pairs its color with this.
const RENTAL_STATUS_LABELS: Record<"ACTIVE" | "RETURNED", string> = {
  ACTIVE: "Activa",
  RETURNED: "Devuelta",
};

export function rentalStatusLabel(status: "ACTIVE" | "RETURNED"): string {
  return RENTAL_STATUS_LABELS[status];
}

export const rentalItemSchema = z.object({
  item_type: z.enum(RENTAL_ITEM_TYPES),
  quantity: z.number().int().min(1, "La cantidad debe ser al menos 1."),
});

export type RentalItemFormValues = z.infer<typeof rentalItemSchema>;

export const rentalFormSchema = z.object({
  customer_id: z.string().min(1, "Selecciona o crea un cliente."),
  items: z
    .array(rentalItemSchema)
    .min(1, "Selecciona al menos un producto."),
  // PocketBase's `initial_rent_amount` field is `required: true`
  // (pb_migrations/1787760020_rentals_collection.js) — for a `number` field
  // that means "must be non-zero", not just "must be present" (PocketBase
  // can't otherwise tell a numeric zero-value apart from "not sent"; the
  // server rejects 0 with "Cannot be blank." even though it's a valid,
  // present number). Confirmed live against a local instance: `min(0)` here
  // let $0 through client-side, then the server bounced it as a generic
  // "Failed to create record." with no field surfaced to the UI. `.gt(0)`
  // matches the real server contract.
  initial_rent_amount: z
    .number()
    .gt(0, "La renta inicial debe ser mayor a 0."),
  deposit_amount: z.number().min(0, "El depósito no puede ser negativo."),
});

export type RentalFormValues = z.infer<typeof rentalFormSchema>;

export const emptyRentalFormValues: RentalFormValues = {
  customer_id: "",
  items: [],
  initial_rent_amount: 0,
  deposit_amount: 0,
};

/**
 * §7.1: "Registrar depósito" happens as part of confirming a new rental.
 * §22/CU4 only require a `deposit` payment to exist when there's a deposit
 * to register — CU4's own acceptance scenario creates exactly one payment
 * (`deposit`, $1000) alongside the rental, nothing for `initial_rent_amount`
 * itself (that's the agreed periodic rent, tracked as a `rentals` field and
 * later paid via the "Registrar pago" flow, §7.2/§A.7 — Phase 2). This rule
 * is what decides whether that deposit payment gets created at all.
 */
export function shouldRegisterDepositPayment(depositAmount: number): boolean {
  return depositAmount > 0;
}
