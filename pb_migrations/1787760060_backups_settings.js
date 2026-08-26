/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §27 (Backups) — Phase 4 task 4.4.
 *
 * Confirmed live against this PocketBase v0.40.1 instance's own Settings
 * API (`GET /api/settings`, superuser-only), not assumed: §27's premise —
 * "PocketBase se configura para subir los backups automáticamente a ese
 * bucket S3-compatible" — is directly implementable via
 * `app.settings().backups` (`cron`, `cronMaxKeep`, `s3.*`), the same
 * built-in mechanism the `test-pocketbase` POC already validated end-to-end
 * for local zip backup + restore (see `test-pocketbase/backup-restore.md`)
 * before this SDD was written.
 *
 * **Always applied, no external config needed** — §27's "Frecuencia: diaria
 * como mínimo": a daily cron schedule (`0 3 * * *`, 3am server time — off
 * business hours) with a 7-day retention (`cronMaxKeep`, one week of daily
 * snapshots before the oldest is pruned). This alone produces local backups
 * inside `pb_data/backups/` regardless of whether Backblaze B2 is
 * configured — necessary but NOT sufficient on its own (the POC's own DR
 * notes: a backup that never leaves the same disk as the data it protects
 * "is just a local backup sitting next to the very data it's meant to
 * protect").
 *
 * **Conditionally applied — Backblaze B2 as the off-box destination:** real
 * B2 credentials are not available in this session (Phase 4 scope
 * explicitly excludes task 4.5's live restore drill, which needs them).
 * Rather than hardcode placeholder credentials or skip this half entirely,
 * this migration reads them from environment variables at migration-apply
 * time (`$os.getenv`, confirmed present in this PocketBase version's JSVM
 * bindings) and only enables the S3 backup destination when ALL of them are
 * actually set:
 *
 *   PB_BACKUPS_B2_BUCKET, PB_BACKUPS_B2_REGION, PB_BACKUPS_B2_ENDPOINT,
 *   PB_BACKUPS_B2_ACCESS_KEY, PB_BACKUPS_B2_SECRET
 *
 * On a machine without these set (every dev/scratch instance today, this
 * session's own verification included), the migration safely no-ops for
 * the S3 half — `backups.s3.enabled` stays `false`, matching the current
 * `false` default and confirmed live by
 * `src/data/backups-settings.integration.test.ts`. On the real VPS, once
 * the business's actual Backblaze B2 bucket/keys are provisioned (task 4.5
 * territory, not this one), setting those 5 env vars before starting
 * PocketBase and re-running this migration (or restarting the process,
 * which re-applies already-tracked migrations only once — see note below)
 * activates the real destination without any code change.
 *
 * `forcePathStyle: false` — Backblaze B2's S3-compatible endpoint supports
 * virtual-hosted-style requests; confirm this against B2's own docs at
 * actual deploy time if that ever changes (§27 already flags real B2
 * credentials as pending in this project).
 *
 * **Operational note (not exercised in this session, no live/persistent
 * instance exists yet):** because PocketBase migrations only run once
 * (tracked in `_migrations`), if B2 credentials are added to the
 * environment AFTER this migration already ran once on a real instance,
 * re-running it requires either a fresh migration bump or applying the
 * equivalent `PATCH /api/settings` call directly from the admin panel —
 * documented here so the person doing the real deploy isn't surprised by
 * PocketBase's normal migration-idempotency behavior.
 */
migrate(
  (app) => {
    const settings = app.settings();

    settings.backups.cron = "0 3 * * *";
    settings.backups.cronMaxKeep = 7;

    const bucket = $os.getenv("PB_BACKUPS_B2_BUCKET");
    const region = $os.getenv("PB_BACKUPS_B2_REGION");
    const endpoint = $os.getenv("PB_BACKUPS_B2_ENDPOINT");
    const accessKey = $os.getenv("PB_BACKUPS_B2_ACCESS_KEY");
    const secret = $os.getenv("PB_BACKUPS_B2_SECRET");

    if (bucket && region && endpoint && accessKey && secret) {
      settings.backups.s3 = {
        enabled: true,
        bucket: bucket,
        region: region,
        endpoint: endpoint,
        accessKey: accessKey,
        secret: secret,
        forcePathStyle: false,
      };
    }

    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.backups.cron = "";
    settings.backups.s3.enabled = false;
    app.save(settings);
  },
);
