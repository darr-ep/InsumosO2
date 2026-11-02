import { z } from "zod";

/**
 * SDD.md §20 (validaciones — pago, capa Zod) + §7.2 (flujo Registrar pago) +
 * §11.2 (payment_type) + Anexo A.7 (sugerencia de pago) + CU5. Pure rules
 * for `PaymentDialog` (task 2.4). `PaymentDialog` only ever creates `rent`
 * or `adjustment` payments — `deposit` payments are created exclusively as
 * part of "Nueva renta" (task 1.4/1.5, §7.1), never from this dialog.
 */

export const PAYMENT_DIALOG_TYPES = ["rent"] as const;
export type PaymentDialogType = (typeof PAYMENT_DIALOG_TYPES)[number];

// Redesign Round 3 (Detalle de renta — historial de pagos): display label
// for a payment's `payment_type`, independent of `PaymentDialog`'s own
// "Pago" button copy — the history timeline names the actual kind
// of payment (a `deposit` is never created from `PaymentDialog`, only
// alongside the rental itself, §7.1).
// Redesign — UX/UI pass (business-owner finding, post-launch audit):
// renamed from the bare "Depósito" — in the payment-history timeline it
// read as ambiguous with *returning* a deposit (ReturnDialog's own
// "Depósito a devolver"). "Depósito inicial" makes clear this row is the
// one-time deposit captured at rental creation, never the return.
const PAYMENT_TYPE_LABELS: Record<"rent" | "deposit" | "adjustment", string> =
  {
    rent: "Pago",
    deposit: "Pago Inicial",
    adjustment: "Ajuste",
  };

export function paymentTypeLabel(
  paymentType: "rent" | "deposit" | "adjustment",
): string {
  return PAYMENT_TYPE_LABELS[paymentType];
}

export const paymentFormSchema = z.object({
  payment_type: z.enum(PAYMENT_DIALOG_TYPES).default("rent"),
  amount: z.number().gt(0, "El monto debe ser mayor a 0."),
  note: z.string().trim().optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

/**
 * Anexo A.7 + CU5: monto sugerido para "Registrar pago" es el último pago
 * de tipo `rent` (§7.2's "Último pago: $X"); sin historial de pagos `rent`
 * previos, se usa `initial_rent_amount` como sugerencia del primer pago.
 * The `deposit` payment a rental may already have (task 1.4) is
 * deliberately not "historial" for this rule — see
 * data/payments.repo.ts#getLastRentPayment.
 */
export function suggestedPaymentAmount(
  lastRentPaymentAmount: number | null,
  initialRentAmount: number,
): number {
  return lastRentPaymentAmount ?? initialRentAmount;
}

// §16.10: "total pagado" in Detalle de renta (task 3.3) — the sum of every
// payment on the rental (deposit + rent + adjustment, adjustments can be
// negative per §11.2/§20). No business rule filters any payment_type out
// here, unlike getLastRentPayment's rent-only filter for the suggestion.
export function totalPaid(amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}
