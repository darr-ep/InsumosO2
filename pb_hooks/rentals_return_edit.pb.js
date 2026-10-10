/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §19.1 (endpoint custom) + §7.3 (flujo Devolución) + §26 (auditoría).
 *
 * `POST /api/rentals/{id}/update-return` — a custom route to update
 * `deposit_returned_amount` and `note` on an already-returned rental.
 *
 * The collection's `updateRule` blocks the client from setting
 * `deposit_returned_amount` directly through the generic PATCH endpoint
 * (`:isset = false` guard added alongside the other locked fields), so this
 * custom route is the only authorised way to change that field after the
 * initial return — same pattern `rentals_return.pb.js` uses to set
 * `status`/`returned_at`/`returned_by` (those can't be PATCH'd either).
 *
 * body: `{ deposit_returned_amount?: number, note?: string }`
 *
 * 1. 404s if the rental doesn't exist.
 * 2. 400s if the rental isn't `RETURNED` (only returned rentals have a
 *    `deposit_returned_amount` to correct; ACTIVE rentals go through the
 *    normal return flow in `rentals_return.pb.js`).
 * 3. Updates `deposit_returned_amount` (if provided in the body),
 *    `note` (if provided), and `updated_by = @request.auth.id`.
 * 4. Returns the updated rental as JSON.
 *
 * Runs with internal DB access via `e.app`/`txApp`, not subject to the §13
 * API Rules — same pattern as `rentals_folio.pb.js` and `rentals_return.pb.js`.
 */
routerAdd(
  "POST",
  "/api/rentals/{id}/update-return",
  (e) => {
    const id = e.request.pathValue("id");

    const data = new DynamicModel({
      deposit_returned_amount: -0,
      note: "",
    });
    e.bindBody(data);

    let rental;
    try {
      rental = e.app.findRecordById("rentals", id);
    } catch {
      throw new NotFoundError("Renta no encontrada.");
    }

    if (rental.get("status") !== "RETURNED") {
      throw new BadRequestError(
        "Solo se pueden editar los detalles de una renta ya devuelta.",
      );
    }

    e.app.runInTransaction((txApp) => {
      const depositReturnedAmount = Number(data.deposit_returned_amount);
      if (!isNaN(depositReturnedAmount)) {
        rental.set("deposit_returned_amount", depositReturnedAmount);
      }
      if (data.note !== undefined) {
        rental.set("note", String(data.note));
      }

      rental.set("updated_by", e.auth.id);
      txApp.save(rental);
    });

    return e.json(200, rental);
  },
  $apis.requireAuth(),
);
