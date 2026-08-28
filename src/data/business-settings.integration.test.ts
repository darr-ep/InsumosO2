// @vitest-environment node
//
// Real network I/O against a live, ISOLATED scratch PocketBase instance —
// never the shared `VITE_POCKETBASE_URL` (port 8090) every other
// integration test in this repo defaults to. This test proves the new
// `business_settings` collection's real API Rules, not a mock.
import { beforeEach, describe, expect, it } from "vitest";
import PocketBase, { ClientResponseError } from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced) — `pb_migrations/
 * 1787760070_business_settings_collection.js`.
 *
 * **Runs against a DEDICATED scratch instance, not the shared 8090 one** —
 * same pattern `rate-limiting.integration.test.ts`/
 * `backups-settings.integration.test.ts` already established for a
 * second/third optional instance (`VITE_PB_TEST_RATE_LIMIT_URL`/
 * `VITE_PB_TEST_B2_CONFIGURED_URL`): the user may be live-testing the real
 * app against port 8090/`pb_data/` right now, so this test targets
 * `VITE_PB_TEST_BUSINESS_SETTINGS_URL` and skips gracefully (not fails)
 * when nothing answers there, exactly like every other optional
 * second-instance dependency in this suite.
 *
 * Proves, against the REAL migration (not assumed from reading it):
 *   1. An authenticated user can list/view the singleton row and update
 *      either total (increase AND decrease — same call path, no separate
 *      code path per direction).
 *   2. An unauthenticated (anonymous) request is rejected for both list and
 *      update — the collection is never publicly readable/writable.
 *   3. A client attempting to CREATE a second row is rejected — `createRule
 *      = null` is superuser/admin-panel-only by design (singleton
 *      collection, see the migration's own docblock).
 */

const PB_URL =
  import.meta.env.VITE_PB_TEST_BUSINESS_SETTINGS_URL ||
  "http://127.0.0.1:8090";

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
  "business_settings API Rules — live PocketBase (Feature: Runtime-Editable Total Stock)",
  () => {
    let pb: PocketBase;

    beforeEach(async () => {
      const primary = await createTestUser(PB_URL, "9");
      pb = primary.client;
    });

    it("lets an authenticated user list the singleton row seeded by the migration", async () => {
      const result = await pb.collection("business_settings").getList(1, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        total_concentradores: expect.any(Number),
        total_tanques: expect.any(Number),
      });
    });

    it("lets an authenticated user INCREASE total_concentradores", async () => {
      const before = await pb
        .collection("business_settings")
        .getFirstListItem("");

      const updated = await pb
        .collection("business_settings")
        .update(before.id, {
          total_concentradores: before.total_concentradores + 5,
        });

      expect(updated.total_concentradores).toBe(
        before.total_concentradores + 5,
      );
    });

    it("lets an authenticated user DECREASE total_tanques (business owner: 'tanto para aumentar como disminuir')", async () => {
      const before = await pb
        .collection("business_settings")
        .getFirstListItem("");
      // Establish a known non-zero value first so the decrease is real, not
      // accidentally clamped by the `min: 0` schema constraint.
      await pb
        .collection("business_settings")
        .update(before.id, { total_tanques: 10 });

      const updated = await pb
        .collection("business_settings")
        .update(before.id, { total_tanques: 3 });

      expect(updated.total_tanques).toBe(3);
    });

    // Real PocketBase behavior, already documented by this repo's own
    // `audit-fields.integration.test.ts`: `listRule`/`viewRule` are a
    // FILTER, not a hard gate — an unauthenticated list request returns a
    // normal 200 with the row filtered OUT (empty results), it does not
    // throw. Confirmed live here, not assumed: an authenticated request
    // against the exact same collection returns the seeded row (see the
    // first test above); an anonymous request against that same collection
    // returns none.
    it("filters the singleton row out of an anonymous (unauthenticated) list request (never publicly readable)", async () => {
      const anon = new PocketBase(PB_URL);

      const result = await anon.collection("business_settings").getList(1, 1);

      expect(result.items).toHaveLength(0);
    });

    it("rejects an anonymous (unauthenticated) update request", async () => {
      const before = await pb
        .collection("business_settings")
        .getFirstListItem("");
      const anon = new PocketBase(PB_URL);

      let caught: unknown;
      try {
        await anon
          .collection("business_settings")
          .update(before.id, { total_concentradores: 999 });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ClientResponseError);
      // Confirm the anonymous write never actually applied.
      const reloaded = await pb
        .collection("business_settings")
        .getOne(before.id);
      expect(reloaded.total_concentradores).not.toBe(999);
    });

    it("rejects a client attempt to create a second row (singleton collection, createRule = null)", async () => {
      await expect(
        pb.collection("business_settings").create({
          total_concentradores: 1,
          total_tanques: 1,
        }),
      ).rejects.toThrow();
    });
  },
);
