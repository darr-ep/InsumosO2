// @vitest-environment node
//
// Real network I/O against a live PocketBase, exercising the actual
// Settings API, not a mock.
import { describe, expect, it } from "vitest";
import PocketBase from "pocketbase";

/**
 * SDD.md §27 (Backups) — Phase 4 task 4.4.
 *
 * `pb_migrations/1787760060_backups_settings.js` always enables a daily
 * cron backup schedule, and conditionally enables the Backblaze B2 (S3-
 * compatible) destination only when 5 specific env vars are present at
 * migration-apply time.
 *
 * This file verifies BOTH halves against live instances:
 *   1. `VITE_POCKETBASE_URL` — the normal scratch instance used by every
 *      other integration test in this repo, started WITHOUT B2 env vars.
 *      Cron must still be configured (daily backups happen regardless);
 *      S3 must stay disabled (no real credentials available this session,
 *      §27's own restore-drill task 4.5 territory, not this one).
 *   2. `VITE_PB_TEST_B2_CONFIGURED_URL` — an optional second instance
 *      started WITH the 5 env vars set to structurally-valid dummy values
 *      (proves the conditional wiring itself works end-to-end without
 *      needing real Backblaze B2 credentials); skipped gracefully if not
 *      provided, same pattern as every other live-instance dependency in
 *      this suite.
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
const B2_CONFIGURED_URL = import.meta.env.VITE_PB_TEST_B2_CONFIGURED_URL || "";

const SUPERUSER_EMAIL = "phase4-test-superuser@insumoso2.local";
const SUPERUSER_PASSWORD = "Passw0rd!2026Super";

async function isReachable(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await fetch(`${url}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

const reachable = await isReachable(PB_URL);
const b2Reachable = await isReachable(B2_CONFIGURED_URL);

describe.skipIf(!reachable)(
  "backups settings — daily cron always on, S3/B2 stays off without credentials (§27, task 4.4)",
  () => {
    it("configures a daily cron schedule with retention, and leaves S3 disabled when no B2 env vars are set", async () => {
      const pb = new PocketBase(PB_URL);
      await pb
        .collection("_superusers")
        .authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);

      const settings = await pb.settings.getAll();

      expect(settings.backups.cron).toBe("0 3 * * *");
      expect(settings.backups.cronMaxKeep).toBe(7);
      expect(settings.backups.s3.enabled).toBe(false);
    });
  },
);

describe.skipIf(!b2Reachable)(
  "backups settings — S3/B2 destination activates when the 5 required env vars are present (§27, task 4.4)",
  () => {
    it("enables the S3 backup destination with the exact configured values", async () => {
      const pb = new PocketBase(B2_CONFIGURED_URL);
      await pb
        .collection("_superusers")
        .authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);

      const settings = await pb.settings.getAll();

      expect(settings.backups.s3.enabled).toBe(true);
      expect(settings.backups.s3.bucket).toBe("phase4-test-bucket");
      expect(settings.backups.s3.region).toBe("us-west-004");
      expect(settings.backups.s3.endpoint).toBe(
        "https://s3.us-west-004.backblazeb2.com",
      );
      expect(settings.backups.s3.accessKey).toBe("dummy-access-key");
      // .secret is intentionally excluded from MarshalJSON (confirmed via
      // pb_data/types.d.ts's own docblock: "sensitive fields (S3 secret,
      // SMTP password, etc.) are excluded") — not assertable via the API,
      // and correctly so; the accessKey/bucket/region/endpoint match above
      // is enough to prove the whole object was set from the env vars, not
      // partially or silently defaulted.
      expect(settings.backups.cron).toBe("0 3 * * *");
    });
  },
);
