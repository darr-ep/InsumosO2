# Backblaze B2 automated backups (§27) — activation steps for real deploy

**Status: code/config ready and live-verified with dummy credentials
(`src/data/backups-settings.integration.test.ts`); NOT yet activated with
real Backblaze B2 credentials.** Real credential provisioning and the
actual restore drill are explicitly task 4.5's job (deferred, needs the
user), not this one.

## What's already done (task 4.4)

`pb_migrations/1787760060_backups_settings.js` already:

1. Enables a **daily cron backup** (`0 3 * * *`, 3am server time) with
   7-day retention, unconditionally — this alone satisfies §27's
   "frecuencia: diaria como mínimo" and produces local `pb_data/backups/`
   zip snapshots regardless of B2 being configured.
2. Reads 5 env vars at migration-apply time and, only if ALL are present,
   configures PocketBase's native S3-compatible backup destination so
   those daily backups upload automatically off the VPS's own disk (§27's
   real point — a backup that never leaves the same disk it protects
   "is just a local backup sitting next to the very data it's meant to
   protect", per `test-pocketbase/backup-restore.md`'s own DR analysis).

## Steps to actually activate B2 at real deploy time

1. **Create the Backblaze B2 bucket + application key** (business already
   uses B2 for another project per SDD.md §27 — reuse that account,
   create a new bucket/key scoped to this project rather than sharing
   credentials across projects).
2. Note down, from B2's console:
   - Bucket name → `PB_BACKUPS_B2_BUCKET`
   - Region (e.g. `us-west-004`) → `PB_BACKUPS_B2_REGION`
   - S3-compatible endpoint (e.g.
     `https://s3.us-west-004.backblazeb2.com`) → `PB_BACKUPS_B2_ENDPOINT`
   - Application Key ID → `PB_BACKUPS_B2_ACCESS_KEY`
   - Application Key (secret) → `PB_BACKUPS_B2_SECRET`
3. Set all 5 as environment variables for the PocketBase process on the
   VPS (systemd `Environment=` directives, or an env file the service
   unit loads — NOT committed to this repo, same practice as
   `VITE_POCKETBASE_URL` in `.env.example`).
4. Start (or restart) PocketBase. **Migration idempotency caveat**: if
   PocketBase already ran on this instance before these env vars were
   set, `1787760060_backups_settings.js` already applied once and won't
   re-run automatically (PocketBase migrations are tracked in
   `_migrations` and only run once per instance). On a genuinely fresh
   deploy this isn't an issue — the migration runs for the first time
   with the env vars already present. If retrofitting onto an
   already-running instance, either apply the equivalent
   `PATCH /api/settings` directly from the admin panel, or accept a
   one-time superuser-panel configuration instead of relying on the
   migration re-running.
5. Verify (superuser panel, Settings → Backups, or `GET /api/settings`):
   `backups.s3.enabled` is `true` and the bucket/region/endpoint/accessKey
   match what was set.
6. **Do not consider this "done" until task 4.5's restore drill actually
   succeeds** — per §27.4 and `test-pocketbase/backup-restore.md`'s own
   conclusion, "un backup nunca probado no es un backup confiable."

## What NOT to do

- Do not hardcode real B2 credentials anywhere in this repo (source,
  migrations, `.env.example`, or this doc) — env vars only, set directly
  on the VPS process.
- Do not skip the restore drill (task 4.5) just because the upload
  configuration itself is verified — configuration correctness and
  restore correctness are different guarantees, and this project's own
  history (§27's origin: the business already lost ~$5,000 from a
  control gap) is exactly why that distinction matters here.
