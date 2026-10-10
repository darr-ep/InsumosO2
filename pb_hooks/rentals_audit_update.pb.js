/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §26 (auditoría) — gap-fill: `updated_by` on rental updates.
 *
 * `pb_hooks/rentals_folio.pb.js` only runs on `onRecordCreateRequest` —
 * it sets `created_by = updated_by = @request.auth.id` when the rental is
 * first created. But no hook was setting `updated_by` on subsequent edits,
 * so the field stayed stale (still pointing at whoever originally created
 * the rental) after any PATCH through `updateRental` (rentals.repo.ts) or
 * any future update path.
 *
 * The collection's `updateRule` blocks the client from sending `updated_by`
 * in the request body (`:isset = false` guard, same as `created_by` and
 * `folio`/`status`), so it can only be set here, server-side, where the
 * internal DB access bypasses those rules — the exact same pattern
 * `rentals_folio.pb.js` uses for `created_by`/`updated_by` on create and
 * `rentals_return.pb.js` uses for `returned_by` on the return endpoint.
 */
onRecordUpdateRequest((e) => {
  e.record.set("updated_by", e.auth ? e.auth.id : "");
  e.next();
}, "rentals");
