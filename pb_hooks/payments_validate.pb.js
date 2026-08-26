/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §20 (validaciones — servidor) + §11.2 (`payment_type`) + §26
 * (auditoría). Runs on every `payments` create request with internal DB
 * access — not subject to the API Rules in §13 (those only gate what the
 * *client* may include in the request body). Task 2.2:
 *
 *   1. Rejects the creation of a `payment` with `payment_type = 'adjustment'`
 *      when `note` is missing/blank (§20, §11.2, CU5's last scenario) — a
 *      conditional rule the plain PocketBase schema can't express by itself.
 *   2. Sets `created_by = @request.auth.id` (§26), never trusted from the
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

  e.record.set("created_by", e.auth ? e.auth.id : "");

  e.next();
}, "payments");
