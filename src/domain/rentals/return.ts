import { z } from "zod";

/**
 * SDD.md §7.3 (flujo Devolución) + §20 (validaciones) + CU6. Pure rules for
 * `ReturnDialog` (task 3.2) — `status`/`returned_at`/`returned_by` are
 * never part of this schema, they're always server-set
 * (§19.1, `pb_hooks/rentals_return.pb.js`, task 3.1).
 */

export const returnFormSchema = z.object({
  amount_collected: z
    .number()
    .min(0, "El monto cobrado no puede ser negativo."),
  deposit_returned: z
    .number()
    .min(0, "El depósito a devolver no puede ser negativo."),
  note: z.string().trim().optional(),
});

export type ReturnFormValues = z.infer<typeof returnFormSchema>;

/**
 * CU6's first scenario: "ve un monto sugerido y un depósito a devolver,
 * ambos editables". §7.3 doesn't define a different rule for the amount
 * than "Registrar pago" already has (§A.7) — reusing
 * domain/payments/payment.ts#suggestedPaymentAmount keeps one source of
 * truth instead of a second, subtly different formula.
 *
 * The deposit-to-return suggestion defaults to the full deposit captured
 * at "Nueva renta" — CU6's third scenario ("el monto sugerido... no es
 * obligatorio") explicitly allows changing it without justification, so
 * this is a starting point, not a rule.
 */
export function suggestedDepositReturn(depositAmount: number): number {
  return depositAmount;
}
