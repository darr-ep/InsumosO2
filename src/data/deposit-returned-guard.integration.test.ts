// @vitest-environment node
//
// Same reasoning as audit-fields.integration.test.ts: real network I/O
// against a live PocketBase, exercising the actual server-side guard, not
// a mock.
import { describe, expect, it } from "vitest";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §11 (`deposit_returned_amount` — "se llena al devolver", filled
 * only by `pb_hooks/rentals_return.pb.js`, same server-computed category as
 * `folio`/`status`/`returned_at`/`returned_by`/`created_by`/`updated_by`) +
 * §13 (API Rules — those other fields already carry `:isset = false` on
 * both `create` and `update`; `deposit_returned_amount` never did).
 *
 * Gap-fill finding 1 (fresh full SDD-vs-codebase audit, post-Login/Auth
 * gap-fill): `pb_migrations/1787760020_rentals_collection.js` never blocked
 * `deposit_returned_amount` in either `createRule` or `updateRule`. Before
 * this fix, ANY authenticated user could call
 * `pb.collection('rentals').update(id, { deposit_returned_amount: 999999 })`
 * on any rental (or set it directly on create) — bypassing the return
 * endpoint (`pb_hooks/rentals_return.pb.js`) entirely, with zero guard.
 * This test proves that gap is closed on BOTH operations.
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";

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
  "deposit_returned_amount — server-side guard against a live PocketBase (§11/§13, gap-fill finding 1)",
  () => {
    async function setup() {
      const testUser = await createTestUser(PB_URL, "6");
      const pb = testUser.client;

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (deposit_returned_amount guard)",
        phone: `8${uniqueSuffix}`.slice(0, 10),
      });

      return { pb, customerId: customer.id };
    }

    it("rejects a create request that sets a client-supplied deposit_returned_amount", async () => {
      const { pb, customerId } = await setup();

      await expect(
        pb.collection("rentals").create({
          customer_id: customerId,
          initial_rent_amount: 2800,
          deposit_amount: 1000,
          deposit_returned_amount: 999999,
        }),
      ).rejects.toThrow();
    });

    it("rejects a direct client update of deposit_returned_amount, bypassing the return endpoint", async () => {
      const { pb, customerId } = await setup();

      const rental = await pb.collection("rentals").create({
        customer_id: customerId,
        initial_rent_amount: 2800,
        deposit_amount: 1000,
      });

      await expect(
        pb.collection("rentals").update(rental.id, {
          deposit_returned_amount: 999999,
        }),
      ).rejects.toThrow();

      const reloaded = await pb.collection("rentals").getOne(rental.id);
      expect(reloaded.deposit_returned_amount).not.toBe(999999);
    });

    it("still allows a legitimate update to an unrelated rentals field (guard is scoped, not a full lockdown)", async () => {
      const { pb, customerId } = await setup();

      const rental = await pb.collection("rentals").create({
        customer_id: customerId,
        initial_rent_amount: 2800,
        deposit_amount: 1000,
      });

      const updated = await pb.collection("rentals").update(rental.id, {
        deposit_amount: 1500,
      });

      expect(updated.deposit_amount).toBe(1500);
    });
  },
);
