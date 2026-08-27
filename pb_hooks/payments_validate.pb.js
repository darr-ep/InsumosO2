/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §20 (validaciones — servidor) + §11.2 (`payment_type`) + §26
 * (auditoría) + §19.1/§24 (gap-fill finding 1, third and final
 * SDD-vs-code audit pass). Runs on every `payments` create request with
 * internal DB access — not subject to the API Rules in §13 (those only
 * gate what the *client* may include in the request body). Task 2.2 +
 * gap-fill finding 1:
 *
 *   1. Rejects the creation of a `payment` with `payment_type = 'adjustment'`
 *      when `note` is missing/blank (§20, §11.2, CU5's last scenario) — a
 *      conditional rule the plain PocketBase schema can't express by itself.
 *   2. Rejects the creation of ANY payment whose parent `rental_id` isn't
 *      currently `status = "ACTIVE"` — closes a real race: §24 documents no
 *      realtime sync across the 6 shared devices, and `RentalDetailSheet`'s
 *      "Registrar pago" button is only a render-time gate. If a second user
 *      closes the same rental (`POST /api/rentals/{id}/return`,
 *      `pb_hooks/rentals_return.pb.js`) while a first user's `PaymentDialog`
 *      is already open on their own device, nothing previously stopped the
 *      first user's submit from still succeeding server-side on the
 *      now-RETURNED rental.
 *   3. Sets `created_by = @request.auth.id` (§26), never trusted from the
 *      client body — the `:isset = false` guard added to this collection's
 *      `createRule` in this same task blocks a client from even sending it,
 *      mirroring `pb_hooks/rentals_folio.pb.js`'s handling of
 *      `rentals.created_by`/`updated_by`.
 */
onRecordCreateRequest((e) => {
  const paymentType = e.record.get("payment_type");
  const note = e.record.get("note");

  if (
    paymentType === "adjustment" &&
    (!note || String(note).trim() === "")
  ) {
    throw new BadRequestError(
      "Un pago de ajuste requiere una nota explicando el motivo.",
    );
  }

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
