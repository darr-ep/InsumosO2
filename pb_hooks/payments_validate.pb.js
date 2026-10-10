/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §20 (validaciones — servidor) + §26 (auditoría) + §24 (gap-fill:
 * ACTIVE rental guard). Runs on every `payments` create request with
 * internal DB access — not subject to the API Rules in §13 (those only
 * gate what the *client* may include in the request body).
 *
 *   1. Rejects the creation of ANY payment whose parent `rental_id` isn't
 *      currently `status = "ACTIVE"` — closes a real race: §24 documents no
 *      realtime sync across the 6 shared devices, and `RentalDetailSheet`'s
 *      "Registrar pago" button is only a render-time gate. If a second user
 *      closes the same rental (`POST /api/rentals/{id}/return`,
 *      `pb_hooks/rentals_return.pb.js`) while a first user's `PaymentDialog`
 *      is already open on their own device, nothing previously stopped the
 *      first user's submit from still succeeding server-side on the
 *      now-RETURNED rental.
 *   2. Sets `created_by = @request.auth.id` (§26), never trusted from the
 *      client body — the `:isset = false` guard added to this collection's
 *      `createRule` in this same task blocks a client from even sending it,
 *      mirroring `pb_hooks/rentals_folio.pb.js`'s handling of
 *      `rentals.created_by`/`updated_by`.
 *
 * Note: the previous guard that required a non-empty `note` for
 * `payment_type = 'adjustment'` has been removed. The UI only creates
 * `rent` payments (`PAYMENT_DIALOG_TYPES = ['rent']` in
 * `domain/payments/payment.ts`), so adjustment creation is no longer part
 * of the UI's contract. Any future API-level adjustment creation is outside
 * the UI's contract and is not validated here.
 */
onRecordCreateRequest((e) => {
  const rentalId = e.record.get("rental_id");

  let rental;
  try {
    rental = e.app.findRecordById("rentals", rentalId);
  } catch {
    throw new BadRequestError("La renta relacionada no existe.");
  }

  if (rental.get("status") !== "ACTIVE") {
    throw new BadRequestError(
      "No se puede registrar un pago: la renta ya fue devuelta.",
    );
  }

  e.record.set("created_by", e.auth ? e.auth.id : "");

  e.next();
}, "payments");
