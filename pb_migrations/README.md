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
  `rentals`. Computes the next sequential folio (`R-001`, ...), forces
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

## Phase 4 (Auditoria, hardening y pulido) -- superuser + env vars now required for the full suite

- `1787760000_users_phone_identity.js` -- task 4.2 added `createRule = null`
  (admin-panel-only account creation, closing a real public
  self-registration gap -- see `src/data/auth-registration.integration.test.ts`).
  **This changes local setup**: `src/data/testSupport.ts` now creates every
  live-integration test's throwaway user via a superuser session instead of
  the (now closed) public create endpoint, so a superuser MUST exist on any
  instance you run the suite against:
  ```
  ./pocketbase superuser upsert phase4-test-superuser@insumoso2.local test-superuser-pass-12345
  ```
  (email/password are `testSupport.ts`'s defaults, overridable via
  `VITE_PB_TEST_SUPERUSER_EMAIL`/`VITE_PB_TEST_SUPERUSER_PASSWORD` for a
  real/CI instance that shouldn't share this repo's committed default).
- `1787760020_rentals_collection.js` / `1787760040_payments_collection.js`
  -- task 4.1/4.2 added `created_by`/`updated_by` (`created_by` only for
  `payments`) `:isset = false` guards to `updateRule` too, not just
  `createRule` -- a real gap `src/data/audit-fields.integration.test.ts`
  found: a client could otherwise forge those audit fields via a generic
  `pb.collection(...).update()` call. See the migration files' own
  docblocks for the full story.
- `1787760050_rate_limiting_settings.js` (task 4.3) -- enables PocketBase's
  **native, built-in rate limiter** (`app.settings().rateLimits`), a real
  finding this task made: SDD.md §25 says PocketBase has no built-in
  per-endpoint rate limiting and this must be configured at the
  `nginx-proxy-manager` layer -- confirmed FALSE for PocketBase v0.40.1 via
  its own live Settings API. **This changes how you run the full suite
  locally**: set `PB_TEST_MODE=1` before starting any instance you intend
  to run this repo's live-integration suite against, or the production
  `*:auth` budget (10 requests / 30s) will 429 the suite's own legitimate
  multi-user-login traffic:
  ```
  PB_TEST_MODE=1 ./pocketbase serve
  ```
  `src/data/rate-limiting.integration.test.ts` deliberately targets a
  SECOND, separate instance (`VITE_PB_TEST_RATE_LIMIT_URL`) started
  WITHOUT `PB_TEST_MODE`, to prove the real production budget genuinely
  429s -- see that file's own docblock. See also
  `deploy/nginx-proxy-manager-rate-limiting.md` for the complementary
  (still VPS-dependent, not yet applied) reverse-proxy layer SDD.md §25
  originally called for.
- `1787760060_backups_settings.js` (task 4.4) -- always enables a daily
  cron backup schedule (`0 3 * * *`, 7-day retention); conditionally
  enables the Backblaze B2 (S3-compatible) backup destination only when 5
  env vars are present at migration-apply time: `PB_BACKUPS_B2_BUCKET`,
  `PB_BACKUPS_B2_REGION`, `PB_BACKUPS_B2_ENDPOINT`,
  `PB_BACKUPS_B2_ACCESS_KEY`, `PB_BACKUPS_B2_SECRET`. None of these are
  set in this repo or in any scratch instance used for verification --
  real Backblaze B2 credentials are explicitly out of scope for this task
  (see task 4.5, restore drill, still pending). See
  `src/data/backups-settings.integration.test.ts` for how the conditional
  wiring itself was verified live with structurally-valid dummy values
  (`VITE_PB_TEST_B2_CONFIGURED_URL`, a third optional instance), and
  `test-pocketbase/backup-restore.md` for the earlier POC's own real
  local-zip backup/restore validation (same underlying PocketBase
  mechanism, no B2 involved).

### Running the full live-integration suite after Phase 4

```
# instance 1 (required) -- everything except the two scenarios below
PB_TEST_MODE=1 ./pocketbase serve --http=127.0.0.1:8090
./pocketbase superuser upsert phase4-test-superuser@insumoso2.local test-superuser-pass-12345

# instance 2 (optional) -- proves the real (non-test-mode) rate limit
./pocketbase serve --http=127.0.0.1:8091   # a second copy, no PB_TEST_MODE
./pocketbase superuser upsert phase4-test-superuser@insumoso2.local test-superuser-pass-12345

# instance 3 (optional) -- proves the B2 conditional wiring with dummy values
PB_BACKUPS_B2_BUCKET=test-bucket PB_BACKUPS_B2_REGION=us-west-004 \
PB_BACKUPS_B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com \
PB_BACKUPS_B2_ACCESS_KEY=dummy PB_BACKUPS_B2_SECRET=dummy \
./pocketbase serve --http=127.0.0.1:8092
./pocketbase superuser upsert phase4-test-superuser@insumoso2.local test-superuser-pass-12345

VITE_POCKETBASE_URL=http://127.0.0.1:8090 \
VITE_PB_TEST_RATE_LIMIT_URL=http://127.0.0.1:8091 \
VITE_PB_TEST_B2_CONFIGURED_URL=http://127.0.0.1:8092 \
npm test
```

Instances 2 and 3 are optional -- their tests skip gracefully (not fail) if
those env vars aren't set, same pattern as every other live-instance
dependency in this suite. Instance 1 is required for any of the other
live-integration tests to run instead of skip.

## Gap-fill: Login/Auth (found post-Phase-5, not in original SDD §35 phase breakdown)

`LoginScreen.tsx` was still Phase 0's literal placeholder after Phase 5
finished -- no phase task ever replaced it. Two migration/backend-side
pieces of that gap:

- `1787760000_users_phone_identity.js` -- `email` is now `required: false`
  (explicit user request). `createRule = null` (task 4.2) already means
  every one of the 6 real accounts is created manually by the superuser
  from the admin panel; forcing an email value on every one of those
  manual creations served no purpose. `email` stays in
  `passwordAuth.identityFields` alongside `phone` (harmless, unused by the
  app). Edited in place, same justification as every other in-place edit
  in this file: never applied against a real deployed/persistent instance.
  See `src/data/login-directory.integration.test.ts` for live proof a
  superuser can create a user with no `email` field at all.
- `pb_hooks/login_directory.pb.js` (new) -- `GET /api/login-directory`, a
  public (unauthenticated) custom route returning only `[{id, name,
  phone}]` for every `users` record. The real `LoginScreen` needs this to
  render its user picker BEFORE the visitor is authenticated, and
  `users.listRule`/`viewRule` stay self-only on purpose (widening them was
  explicitly rejected -- would over-expose `email`/`avatar`/`verified` and
  break the "narrow, explicit surface" pattern task 4.2 established). See
  `src/data/login-directory.integration.test.ts` for live proof: works
  with zero users authenticated, returns exactly those 3 fields per user.

## Redesign — UX/UI pass: login picker avatars (manual step, admin panel only)

`docs/avatars/{nava,astrid,jhetro,bicho,chito,mita}.png` are the 6 real
business-user portraits the owner provided, one per real account. These are
NOT app assets (nothing in `src/` imports them) — they exist purely so
whoever has admin-panel access can upload each one as that user's `avatar`
field when setting up their real account. `pb_hooks/login_directory.pb.js`
now also returns `avatar` (see that file's own docblock for why that's safe
to expose) and `LoginScreen.tsx` renders it as a circular avatar in the user
picker, falling back to an initial-in-a-circle when absent.

Per this file's own established pattern (§4.2's `createRule = null`, gap-fill
Login/Auth section above): create these 6 accounts from the PocketBase admin
panel yourself, one at a time — never scripted, never public self-registration.
For each: `name`, a real or temporary `phone` (identity field — can be
corrected later, it's just an `update`), a temporary password (e.g.
`12345678`, meant to be changed by that person afterward), and upload the
matching `docs/avatars/*.png` as `avatar`.

**One of these is a rename, not a new account:** "Bicho" (Técnico) is the
existing "Darrell" dev/test account already logged in throughout this
redesign round's screenshots — update that same record's `name` and upload
`bicho.png`, don't create a second one. The other 5 (Nava, Astrid, Jhetro,
Chito, Mita) are genuinely new accounts.

## Feature: Runtime-Editable Total Stock (business owner request, post-MVP+redesign, not SDD.md-sourced)

- `1787760070_business_settings_collection.js` -- new `business_settings`
  collection, a SINGLETON (exactly one row, ever, seeded by this migration
  with `total_concentradores: 0, total_tanques: 0`). Replaces the old
  `VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES` build-time env vars
  (Redesign Round 2 Batch 4) -- the business owner can now edit both totals
  herself, at runtime, directly from the Dashboard's availability tiles
  (`DashboardStats.tsx`'s tap-to-edit dialog), no file edit or server
  restart needed. `listRule`/`viewRule`/`updateRule` follow section 13's
  generic authenticated-user pattern; `createRule`/`deleteRule` are `null`
  (superuser/admin-panel-only), same reasoning `users.createRule = null`
  (task 4.2) already established -- nobody should ever be able to spawn a
  second row or delete the only one.
  **Real finding, confirmed live:** both fields are `required: false`, not
  `true` -- a PocketBase `NumberField` with `required: true` rejects `0` as
  "cannot be blank" (confirmed live: this migration's own seed step failed
  to apply with that error when first tried as `required: true`). Since `0`
  is a real, valid "nothing configured yet" state for this field (not an
  error), `required: true` is the wrong constraint here -- `min: 0` +
  `onlyInt: true` already provide the real server-side guard. See the
  migration file's own docblock for the full story, and
  `src/data/business-settings.integration.test.ts` for the live proof (run
  against an ISOLATED scratch instance, see below -- not port 8090).

### Running the business_settings integration test on an isolated scratch instance

Unlike most of this suite (which defaults to the shared port-8090
instance), `business-settings.integration.test.ts` targets a DEDICATED
`VITE_PB_TEST_BUSINESS_SETTINGS_URL` and skips gracefully if unset -- same
optional-second-instance pattern as `rate-limiting.integration.test.ts`/
`backups-settings.integration.test.ts`. This keeps it safe to run without
ever touching a developer's live port-8090 instance/`pb_data/`:

```
mkdir -p /path/to/scratch/data
PB_TEST_MODE=1 ./pocketbase.exe serve --http=127.0.0.1:8095 \
  --dir=/path/to/scratch/data \
  --migrationsDir="$(pwd)/pb_migrations" --hooksDir="$(pwd)/pb_hooks"
./pocketbase.exe superuser upsert phase4-test-superuser@insumoso2.local test-superuser-pass-12345 \
  --dir=/path/to/scratch/data

VITE_PB_TEST_BUSINESS_SETTINGS_URL=http://127.0.0.1:8095 \
npm test -- src/data/business-settings.integration
```

**Real gotcha found while setting this up, worth documenting for next
time:** `pocketbase.exe serve --dir=<scratch-dir>` alone does NOT pick up
this repo's `pb_migrations`/`pb_hooks` the way the "Local development"
section above assumes -- confirmed live: a scratch instance started with
only `--dir` (no explicit `--migrationsDir`/`--hooksDir`) came up with ONLY
PocketBase's built-in system collections and the default `users` table,
none of this repo's own collections/fields applied at all. Passing
`--migrationsDir`/`--hooksDir` explicitly (both pointed at this repo's
folders, `--dir` pointed at the isolated scratch location) is what actually
applies the real migration chain while keeping all data writes fully
isolated from the repo's own `pb_data/`.

## Gap-fill: Self-Service Profile Screen (business owner request, post-Phase-5, not in original SDD §35 phase breakdown)

The 6 real business accounts are created once by the superuser from the
admin panel (§14) and, until now, had no way for the person actually using
one to fix their own name, phone, or password without asking for
admin-panel access. Avatar editing is explicitly OUT of scope: the business
owner reviewed the screen and confirmed users will never change their own
profile photo -- the one the owner assigns at account creation is
permanent ("no cambiarían su imagen, la que les puse será la suya sin
más"), so `ProfileScreen.tsx` shows the avatar read-only with no upload/
change capability. No migration file needed for this -- `users.updateRule`/
`viewRule` are PocketBase's own UNMODIFIED default (`id = @request.auth.id`,
self-only), confirmed live against the local instance rather than trusted
from `1787760000_users_phone_identity.js`'s docblock summary alone. New
code only: `src/data/auth.repo.ts` (`currentAuthUser`, `ownAvatarUrl`,
`updateOwnProfile`, `changeOwnPassword`),
`src/domain/auth/profile.ts` (Zod schemas), `src/screens/profile/
ProfileScreen.tsx` (new route `/perfil`, wired into `App.tsx` the same way
`/nueva-renta` is -- outside `AppLayout`, no bottom nav, reached via
`AccountMenu`'s new "Perfil" item).

**Real findings, confirmed live (2026-09-01) via
`src/data/auth-profile.integration.test.ts` against the local
port-8090 instance, per this file's own "verify live, never assume" house
rule:**

- `users.password` has `min: 8` -- PocketBase's own default, not overridden
  by any migration here. `domain/auth/profile.ts`'s password-change schema
  mirrors this exact number instead of guessing.
- A non-superuser session changing its OWN password/passwordConfirm MUST
  also send the correct `oldPassword` (`pb.collection('users').update(id,
  {oldPassword, password, passwordConfirm})`) -- omitted or wrong, PocketBase
  rejects with a 400.
- **The real gotcha:** on a successful password change, PocketBase rotates
  the record's `tokenKey` server-side, which immediately kills every
  previously-issued token for that user -- INCLUDING the token the very
  request that made the change was using. `pb.authStore.isValid` keeps
  reporting `true` right after (it only checks the JWT's local `exp` claim,
  never round-trips to the server) even though the old token is now dead
  server-side -- the exact same class of bug `src/data/staleSession.ts`
  already documents for a different trigger (found live 2026-08-27).
  Left alone, the app would keep rendering as "logged in" until some later
  unrelated write hit that dead token and got silently bounced to `/login`
  with the generic "Tu sesión expiró" message -- confusing, since by then
  the visitor has forgotten they changed their password. Chosen fix:
  `changeOwnPassword` proactively re-authenticates via `loginWithPassword`
  (the real phone + the just-set new password) immediately after a
  successful change, so a fresh valid session is in place before
  `ProfileScreen` ever tries another request. This was picked over reusing
  the generic stale-session redirect specifically because that message would
  be inaccurate and more jarring here -- the visitor didn't do anything
  wrong, they just changed their own password on purpose.
- `phone` still carries its UNIQUE index (`idx_users_phone`, same migration
  as above) -- a duplicate phone on `updateOwnProfile` fails as a 400 with a
  field-level `{"phone": {"code": "validation_not_unique"}}` in
  `response.data`, confirmed live and mapped to a friendly inline message
  ("Ese teléfono ya está en uso por otra cuenta.") instead of the generic
  save-failure copy.

The avatar shown at the top of `ProfileScreen` is read-only display only
(`UserAvatar` + `ownAvatarUrl`) -- no upload/change UI, no
`compressImage`/`updateOwnAvatar` call. `users.avatar` is a plain (non
`protected`) file field, so `ownAvatarUrl` resolves it with a bare
`pb.files.getURL()`, no `pb.files.getToken()` round-trip, same as
`loginDirectoryAvatarUrl` already established for the pre-login picker;
only the superuser (admin panel, §"Redesign — UX/UI pass: login picker
avatars" above) ever sets this field.

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
