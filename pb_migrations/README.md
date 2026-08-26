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
- `payments_validate.pb.js` (task 2.2) -- `onRecordCreateRequest` hook on
  `payments`. Rejects `payment_type = "adjustment"` without a non-blank
  `note` (§20/CU5), and sets `created_by` from `@request.auth`/`e.auth`
  (§26) -- closing a real gap the Phase 0 version of the `payments`
  migration left open (nothing blocked a client from sending `created_by`
  directly). `1787760040_payments_collection.js` was edited in place to add
  the matching `@request.body.created_by:isset = false` guard, same
  justification as every other in-place migration edit in this repo: never
  applied against a real deployed/persistent instance. Validated live
  against PocketBase v0.40.1 -- see
  `src/data/payments.integration.test.ts` (task 2.8).

## Running the Phase 1 integration test (task 1.10)

`src/data/rentals.integration.test.ts` exercises the real folio/status
guards (tasks 1.1/1.2) against a live PocketBase, not a mock. `npm test`
skips it automatically if nothing answers `${VITE_POCKETBASE_URL}/api/health`
(default `http://127.0.0.1:8090`) -- normal on a machine without a local
instance running, and does not fail the rest of the suite.

To actually run it: start a local instance per "Local development" above,
then `VITE_POCKETBASE_URL=http://127.0.0.1:8090 npm test -- src/data/rentals.integration`.
The `credential_photo` field's `mimeTypes` validation sniffs real file
content, not the declared `Content-Type` -- the test uploads an actual
minimal PNG, not arbitrary bytes with a spoofed type. This test file
forces the Node test environment (`// @vitest-environment node`) rather
than the project default `jsdom`, since jsdom's `FormData`/`File` didn't
reliably interoperate with Node's native `fetch` for multipart uploads
in this test runner (confirmed live: a jsdom `FormData` got rejected with
"400: Unsupported Content-Type").

## Running the Phase 2 integration test (task 2.8)

`src/data/payments.integration.test.ts` follows the exact same pattern:
`VITE_POCKETBASE_URL=http://127.0.0.1:8090 npm test -- src/data/payments.integration`
against a local instance with this repo's migrations/hooks applied. Same
skip-gracefully behavior when nothing answers `/api/health`.

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
