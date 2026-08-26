/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11.1 (folio consecutivo) + §19.1 (status server-side) + §26
 * (auditoría). Runs on every `rentals` create request with internal DB
 * access — not subject to the API Rules in §13 (those only gate what the
 * *client* may include in the request body). Regardless of what the client
 * sent (and the `:isset = false` rules from task 1.1 already reject a
 * request body that even tries to include these fields):
 *
 *   1. Computes the next sequential folio as MAX(existing folio) + 1,
 *      formatted "R-000001" (6-digit, zero-padded, §A.2 — global, never
 *      resets). SQLite serializes writes (confirmed in §11.1), so this
 *      read-then-insert within the same request is safe without a
 *      Postgres-style sequence; the unique index on `folio` added in the
 *      task 1.1 migration is the safety net regardless of that assumption.
 *   2. Forces status = "ACTIVE" — a brand new rental is always active.
 *   3. Sets created_by = updated_by = the authenticated user (§26) — never
 *      trusted from the client body.
 */
onRecordCreateRequest((e) => {
  const nextFolioNumber = (() => {
    const lastRentals = e.app.findRecordsByFilter(
      "rentals",
      "id != ''",
      "-created",
      1,
      0,
    );

    if (lastRentals.length === 0) {
      return 1;
    }

    const match = String(lastRentals[0].get("folio")).match(/(\d+)$/);
    const lastNumber = match ? parseInt(match[1], 10) : 0;

    return lastNumber + 1;
  })();

  e.record.set("folio", "R-" + String(nextFolioNumber).padStart(6, "0"));
  e.record.set("status", "ACTIVE");
  e.record.set("created_by", e.auth ? e.auth.id : "");
  e.record.set("updated_by", e.auth ? e.auth.id : "");

  e.next();
}, "rentals");
