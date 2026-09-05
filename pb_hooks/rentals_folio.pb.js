/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11.1 (folio consecutivo) + §19.1 (status server-side) + §26
 * (auditoría). Runs on every `rentals` create request with internal DB
 * access — not subject to the API Rules in §13 (those only gate what the
 * *client* may include in the request body). Regardless of what the client
 * sent (and the `:isset = false` rules from task 1.1 already reject a
 * request body that even tries to include these fields):
 *
 *   1. Assigns the next sequential folio, formatted "R-001" (3-digit
 *      minimum, zero-padded, §A.2 — global, never resets, grows past the
 *      minimum width once the count exceeds it, e.g. "R-1000"). Sourced
 *      from `rental_folio_counter` (pb_migrations/1787760080), a
 *      single-row counter incremented atomically inside
 *      `app.runInTransaction` — NOT computed by reading "the most recently
 *      created rental" (the previous approach). That approach was
 *      confirmed live to be racy under concurrent creates AND simply wrong
 *      whenever two rentals share a `created` timestamp (ties sort
 *      non-deterministically, so it could return an older record than the
 *      true highest folio and keep recomputing the same already-taken
 *      number on every retry). The counter has neither failure mode: no
 *      read-then-insert window, no dependence on `created` ordering.
 *   2. Forces status = "ACTIVE" — a brand new rental is always active.
 *   3. Sets created_by = updated_by = the authenticated user (§26) — never
 *      trusted from the client body.
 */
onRecordCreateRequest((e) => {
  e.record.set("status", "ACTIVE");
  e.record.set("created_by", e.auth ? e.auth.id : "");
  e.record.set("updated_by", e.auth ? e.auth.id : "");

  let nextFolioNumber;
  e.app.runInTransaction((txApp) => {
    const counter = txApp.findFirstRecordByFilter(
      "rental_folio_counter",
      "id != ''",
    );
    nextFolioNumber = counter.get("value") + 1;
    counter.set("value", nextFolioNumber);
    txApp.save(counter);
  });

  e.record.set("folio", "R-" + String(nextFolioNumber).padStart(3, "0"));

  e.next();
}, "rentals");
