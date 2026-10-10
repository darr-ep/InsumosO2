/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §19.1 (`status`/`returned_at`/`returned_by` resueltos server-side)
 * + §7.3 (flujo Devolución) + CU6. Task 3.1.
 *
 * `POST /api/rentals/{id}/return` — a custom route, not a generic PATCH to
 * the `rentals` collection. This is the ONLY way `rentals.status` can ever
 * become `RETURNED`: task 1.1's `:isset` API Rules already block a client
 * from setting `status`/`returned_at`/`returned_by` directly through the
 * regular collection endpoints, the same principle
 * `pb_hooks/rentals_folio.pb.js` (task 1.2) uses to force `status=ACTIVE`
 * on create.
 *
 * body: `{ amount_collected?: number, deposit_returned?: number, note?: string }`
 *
 * 1. 404s if the rental doesn't exist.
 * 2. 400s if the rental isn't `ACTIVE` (CU6's "no se puede devolver dos
 *    veces la misma renta").
 * 3. Sets `status = "RETURNED"`, `returned_at = ahora`,
 *    `returned_by = @request.auth.id`, `deposit_returned_amount` from the
 *    body, `updated_by = @request.auth.id`.
 * 4. If `amount_collected > 0`, creates a final `rent` payment
 *    (`created_by = @request.auth.id`) in the same transaction — §7.3's
 *    "(opcional) registrar pago final si hay saldo cobrado en ese momento".
 *
 * Runs with internal DB access via `e.app`/`txApp`, not subject to the §13
 * API Rules (those only gate the client-facing generic record endpoints) —
 * same pattern as `rentals_folio.pb.js`.
 *
 * **Note (confirmed against the generated `pb_data/types.d.ts` for
 * v0.40.1, not assumed):** unlike the generic `payments` create endpoint,
 * `onRecordCreateRequest` (`pb_hooks/payments_validate.pb.js`, task 2.2)
 * only wraps the REST record-create route — it does NOT fire for a plain
 * `txApp.save()` call from a custom route like this one. Not a problem
 * here: the final payment this endpoint creates is always
 * `payment_type = "rent"`, never `"adjustment"`, so the note-required rule
 * never applies to it, and `created_by` is set directly from
 * `@request.auth` below — never trusted from the client body, same
 * guarantee §26 requires everywhere else.
 */
routerAdd(
  "POST",
  "/api/rentals/{id}/return",
  (e) => {
    const id = e.request.pathValue("id");

    const data = new DynamicModel({
      amount_collected: -0,
      deposit_returned: -0,
      note: "",
    });
    e.bindBody(data);

    let rental;
    try {
      rental = e.app.findRecordById("rentals", id);
    } catch {
      throw new NotFoundError("Renta no encontrada.");
    }

    if (rental.get("status") !== "ACTIVE") {
      throw new BadRequestError("Esta renta ya fue devuelta.");
    }

    const amountCollected = Number(data.amount_collected) || 0;
    const depositReturned = Number(data.deposit_returned) || 0;
    const note = data.note ? String(data.note) : "";

    e.app.runInTransaction((txApp) => {
      rental.set("status", "RETURNED");
      rental.set("returned_at", new DateTime());
      rental.set("returned_by", e.auth.id);
      rental.set("deposit_returned_amount", depositReturned);
      if (note) {
        rental.set("note", note);
      }
      rental.set("updated_by", e.auth.id);
      txApp.save(rental);

      if (amountCollected > 0) {
        const paymentsCollection = txApp.findCollectionByNameOrId("payments");
        const payment = new Record(paymentsCollection, {
          rental_id: id,
          amount: amountCollected,
          payment_type: "rent",
          note: note,
          created_by: e.auth.id,
        });
        txApp.save(payment);
      }
    });

    return e.json(200, rental);
  },
  $apis.requireAuth(),
);
