import { pb } from "@/data/pocketbaseClient";
import type {
  PaymentRecord,
  PaymentType,
  PaymentWithUser,
} from "@/data/rentals.repo";

/**
 * SDD.md §7.2 (flujo Registrar pago) + §11 (payments) + §11.2 (payment_type)
 * + §20/CU5 (validación de ajuste). Thin wrapper over the PocketBase SDK —
 * `created_by` is never sent by this code, it's forced server-side by
 * `pb_hooks/payments_validate.pb.js` (task 2.2), same principle as
 * `rentals.repo.ts` (task 1.4) for `rentals.folio`/`status`.
 */

const PAYMENTS_COLLECTION = "payments";
const LAST_PAYMENT_PAGE_SIZE = 1;
const PAYMENTS_HISTORY_PAGE_SIZE = 50;

export interface CreatePaymentInput {
  rentalId: string;
  amount: number;
  paymentType: PaymentType;
  note?: string;
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<PaymentRecord> {
  return pb.collection(PAYMENTS_COLLECTION).create<PaymentRecord>({
    rental_id: input.rentalId,
    amount: input.amount,
    payment_type: input.paymentType,
    ...(input.note ? { note: input.note } : {}),
  });
}

// §7.2: "Ver 'Último pago: $X'" — history for a single rental, most recent
// first. Used by Detalle de renta (Phase 3) and to compute the "Registrar
// pago" suggestion (§A.7, task 2.3) alongside domain/payments.
//
// Redesign Round 3, punto 2: expands `created_by` so the payment history
// timeline can show who registered each payment ("Registró: Juan").
export async function listPaymentsForRental(
  rentalId: string,
): Promise<PaymentWithUser[]> {
  const result = await pb
    .collection(PAYMENTS_COLLECTION)
    .getList<PaymentWithUser>(1, PAYMENTS_HISTORY_PAGE_SIZE, {
      filter: pb.filter("rental_id = {:rentalId}", { rentalId }),
      sort: "-created",
      expand: "created_by",
    });

  return result.items;
}

// §A.7: the "Registrar pago" suggestion is based on the last `rent` payment
// specifically — the `deposit` payment created alongside the rental (task
// 1.4) isn't "historial" of periodic rent payments, so it's excluded here.
// domain/payments/payment.ts#suggestedPaymentAmount falls back to
// `initial_rent_amount` when this returns null (CU5's "sin historial previo"
// scenario).
export async function getLastRentPayment(
  rentalId: string,
): Promise<PaymentRecord | null> {
  const result = await pb
    .collection(PAYMENTS_COLLECTION)
    .getList<PaymentRecord>(1, LAST_PAYMENT_PAGE_SIZE, {
      filter: pb.filter(
        "rental_id = {:rentalId} && payment_type = 'rent'",
        { rentalId },
      ),
      sort: "-created",
    });

  return result.items[0] ?? null;
}
