# pb_migrations

Versioned PocketBase collection schema (SDD.md section 11). Applied
automatically on `pocketbase serve` startup, tracked in the `_migrations`
table so each file only runs once.

## Local development

1. Download PocketBase (validated against **v0.40.1**, same version used in
   the `test-pocketbase` POC) for your platform from
   https://github.com/pocketbase/pocketbase/releases/tag/v0.40.1
2. Run it from the repo root so it picks up `pb_migrations/` and
   `pb_hooks/` automatically:
   ```
   ./pocketbase serve
   ```
3. Create a superuser on first run: `./pocketbase superuser upsert <email> <password>`
4. `pb_data/` (SQLite + uploaded files, including credential photos) is
   gitignored on purpose — never commit local dev data.

## What's here (Phase 0 — Fundacion)

- `1787760000_users_phone_identity.js` -- extends PocketBase's built-in
  `users` auth collection with `phone` (section 14: login authenticates
  directly against `phone` as the identity field, no synthetic email
  workaround needed).
- `1787760010_customers_collection.js`
- `1787760020_rentals_collection.js` -- Phase 0 shipped the field set only.
  Phase 1 task 1.1 added the unique index on `folio` and the `:isset` guard
  rules blocking client-set `folio`/`status`/`returned_at`/`returned_by`/
  `created_by`/`updated_by` on `create`/`update` (section 13), landing
  together with `pb_hooks/rentals_folio.pb.js` (task 1.2, section 11.1 /
  19.1) that those guards exist to protect. The migration file was edited
  in place rather than layering a second migration on top, since it had
  never been applied against a real deployed/persistent PocketBase instance
  (only ephemeral local runtime-harness runs) -- see this file's own note
  above about `pb_data/` being gitignored.
- `1787760030_rental_items_collection.js`
- `1787760040_payments_collection.js` -- `payment_type = 'adjustment'`
  requiring `note` is Phase 2 task 2.2 (`pb_hooks/payments_validate.pb.js`,
  section 20), since plain schema rules can't express that condition.

All 4 non-auth collections get the generic API Rule pattern from section 13
(any authenticated user can list/view/create/update, nobody can delete via
the public API). This was validated end-to-end against a local PocketBase
v0.40.1 instance: anonymous list/view is empty/404, authenticated
create/view works, delete is rejected (403), and the protected
`credential_photo` file 404s without a `pb.files.getToken()` token and
200s with one (section 15).

## pb_hooks (Phase 1+)

- `rentals_folio.pb.js` (task 1.2) -- `onRecordCreateRequest` hook on
  `rentals`. Computes the next sequential folio (`R-000001`, ...), forces
  `status = "ACTIVE"`, and sets `created_by`/`updated_by` from
  `@request.auth`/`e.auth`. Validated live against PocketBase v0.40.1 --
  see the integration test evidence in `src/data/rentals.integration.test.ts`
  (task 1.10).

## VPS provisioning (task 0.8) -- deliberately not done in this session

Per `HANDOFF-INICIO-DESARROLLO.md`: "Aprovisionar PocketBase (local para
desarrollo; en el VPS cuando se acerque el despliegue real)" -- explicitly
listed as a non-blocking pending item, not required to start development.
Installing a new production service and reconfiguring
`nginx-proxy-manager` on the business's shared VPS (which also runs other
live projects) is exactly the kind of infrastructure change section 28
says must happen manually and with the user present -- not something to
do unattended from a coding session. Do this as an explicit, separate step
once the app is ready to actually be deployed there.
