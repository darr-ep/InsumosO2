// @vitest-environment node
//
// Real network I/O against a live PocketBase, exercising the actual
// native rate limiter, not a mock.
import { describe, expect, it } from "vitest";
import PocketBase, { ClientResponseError } from "pocketbase";

/**
 * SDD.md §25 (Seguridad — rate limiting) — Phase 4 task 4.3.
 *
 * §25's literal text says PocketBase has no built-in per-endpoint rate
 * limiting and that this must be configured at the `nginx-proxy-manager`
 * reverse-proxy layer. Confirmed FALSE for this project's PocketBase
 * v0.40.1 via its own live Settings API (`GET /api/settings`, superuser
 * only) — it ships a native, per-label rate limiter
 * (`app.settings().rateLimits`), off by default. `pb_migrations/
 * 1787760050_rate_limiting_settings.js` (task 4.3) turns it on with a
 * production `*:auth` budget of 10 requests / 30s, the one directly
 * relevant to §25's stated goal (gating login/`authWithPassword` attempts).
 *
 * **Runs against a DEDICATED instance, not the shared
 * `VITE_POCKETBASE_URL`** every other integration test in this repo uses.
 * That shared instance MUST be started with `PB_TEST_MODE=1` (see the
 * migration's own docblock and `pb_migrations/README.md`) so the rest of
 * the suite's legitimate multi-user-login traffic doesn't get 429'd — this
 * test exists specifically to prove the PRODUCTION (non-test-mode) budget
 * genuinely works, so it targets a second scratch instance
 * (`VITE_PB_TEST_RATE_LIMIT_URL`) started WITHOUT that env var. Skipped
 * gracefully if not provided, same pattern as every other optional
 * second-instance dependency in this suite (see
 * `src/data/backups-settings.integration.test.ts`).
 *
 * This test fires repeated invalid-credential login attempts and asserts a
 * 429 (Too Many Requests) appears once the production `*:auth` bucket is
 * exhausted — confirmed to FAIL (no 429 ever returned, every attempt is a
 * plain 400) against a scratch instance without this task's migration
 * applied, and to PASS after.
 */

const PB_URL =
  import.meta.env.VITE_PB_TEST_RATE_LIMIT_URL || "http://127.0.0.1:8090";

async function isPocketBaseReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${PB_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

const reachable = await isPocketBaseReachable();

describe.skipIf(!reachable)(
  "native rate limiting — repeated login attempts get 429'd (§25, task 4.3)",
  () => {
    it("returns 429 after exceeding the *:auth bucket, not just repeated 400s", async () => {
      const client = new PocketBase(PB_URL);
      const statuses: number[] = [];

      // Sequential, not parallel — the rate limiter buckets by time window,
      // and firing these back-to-back (not all-at-once) is closer to a real
      // brute-force attempt against the login endpoint than a burst that
      // could get coalesced differently by the underlying HTTP client.
      // The production bucket is 10 requests / 30s — 14 attempts guarantees
      // exceeding it well within that window.
      for (let attempt = 0; attempt < 14; attempt++) {
        try {
          await client
            .collection("users")
            .authWithPassword("0000000000", "definitely-wrong-password");
          statuses.push(200);
        } catch (error) {
          if (error instanceof ClientResponseError) {
            statuses.push(error.status);
          } else {
            throw error;
          }
        }
      }

      // Bad credentials alone would be 400 every time (there is no such
      // user) — a 429 appearing proves the rate limiter itself engaged,
      // not just that the login attempts failed for the expected reason.
      expect(statuses).toContain(429);
      // Triangulation: the first attempt(s) must still be a normal
      // credential failure (400), not immediately rate-limited — proves
      // the limiter has a real allowance before it kicks in, not a
      // zero-tolerance lockout that would also break legitimate retries.
      expect(statuses[0]).toBe(400);
    });
  },
);
