// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts (task 1.10): real network
// I/O against a live PocketBase, exercising the actual server-side guards,
// not a mock.
import { beforeEach, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §26 (auditoría) + §13 (API Rules) — Phase 4 task 4.1.
 *
 * §26: "created_by, updated_by y returned_by ... los llenan los hooks
 * server-side ... usando @request.auth.id — nunca se toman del body que
 * manda el cliente (bloqueado explícitamente en las API Rules, sección
 * 13)." §13's closing paragraph is explicit that this "nunca se toman del
 * body" guarantee covers `created_by`/`updated_by` on `rentals` and
 * `created_by` on `payments` — not just at creation time.
 *
 * This test verifies that guarantee END TO END against a live instance:
 *   1. Both `created_by` and `updated_by` are populated server-side at
 *      rental creation (already covered by rentals.integration.test.ts,
 *      re-asserted here for completeness of the audit story in one place).
 *   2. `updated_by` changes to the returning user after a return, alongside
 *      `returned_by` (rentals-return.integration.test.ts only asserted
 *      `returned_by`, not `updated_by` — a real coverage gap this task
 *      closes).
 *   3. A client CANNOT forge `updated_by`/`created_by` on `rentals` via a
 *      generic `update()` call, nor `created_by` on `payments` — this is
 *      the literal audit-integrity guarantee §26/§13 describe. Before this
 *      task's fix, the `rentals`/`payments` `updateRule`s only blocked
 *      `status`/`returned_at`/`returned_by`/`folio` (rentals) — nothing
 *      blocked a client from overwriting `updated_by`/`created_by` directly,
 *      which would let an authenticated user impersonate another user in
 *      the audit trail. That is a real defect, not a hypothetical: an
 *      attacker with any valid session (all 6 users share the same
 *      operational permission level, §14) could call
 *      `pb.collection('rentals').update(id, { updated_by: otherUserId })`
 *      and it would silently succeed pre-fix.
 *   4. A legitimate update to an unrelated field (e.g. `deposit_amount`)
 *      still succeeds — proves the new guard is scoped to the audit fields
 *      only, not an over-broad lockdown of the whole record.
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
  "audit fields (created_by/updated_by/returned_by) — server-side guarantees against a live PocketBase (§26, task 4.1)",
  () => {
    let pb: PocketBase;
    let customerId: string;
    let authUserId: string;
    let otherUserId: string;

    beforeEach(async () => {
      // Phase 4 task 4.2: users.createRule is now admin-panel-only (see
      // pb_migrations/1787760000_users_phone_identity.js) — throwaway test
      // users are created via a superuser session (src/data/testSupport.ts),
      // never the public create endpoint.
      const primary = await createTestUser(PB_URL, "3");
      pb = primary.client;
      authUserId = primary.userId;

      const secondary = await createTestUser(PB_URL, "4");
      otherUserId = secondary.userId;

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (auditoría)",
        phone: `8${uniqueSuffix}`.slice(0, 10),
      });
      customerId = customer.id;
    });

    async function createActiveRental() {
      return pb.collection("rentals").create({
        customer_id: customerId,
        initial_rent_amount: 2800,
        deposit_amount: 1000,
      });
    }

    it("populates created_by and updated_by from the authenticated user at creation (§26)", async () => {
      const rental = await createActiveRental();

      expect(rental.created_by).toBe(authUserId);
      expect(rental.updated_by).toBe(authUserId);
    });

    it("updates updated_by (alongside returned_by) to the returning user after a return (§26/§19.1)", async () => {
      const rental = await createActiveRental();

      const returned = await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 2800, deposit_returned: 1000 },
      });

      expect(returned.returned_by).toBe(authUserId);
      expect(returned.updated_by).toBe(authUserId);
    });

    it("rejects a client attempt to forge rentals.updated_by via a generic update (§26/§13)", async () => {
      const rental = await createActiveRental();

      await expect(
        pb.collection("rentals").update(rental.id, {
          updated_by: otherUserId,
        }),
      ).rejects.toThrow();

      const reloaded = await pb.collection("rentals").getOne(rental.id);
      expect(reloaded.updated_by).toBe(authUserId);
    });

    it("rejects a client attempt to forge rentals.created_by via a generic update (§26/§13)", async () => {
      const rental = await createActiveRental();

      await expect(
        pb.collection("rentals").update(rental.id, {
          created_by: otherUserId,
        }),
      ).rejects.toThrow();

      const reloaded = await pb.collection("rentals").getOne(rental.id);
      expect(reloaded.created_by).toBe(authUserId);
    });

    it("rejects a client attempt to forge payments.created_by via a generic update (§26/§13)", async () => {
      const payment = await pb.collection("payments").create({
        rental_id: (await createActiveRental()).id,
        amount: 100,
        payment_type: "rent",
      });

      await expect(
        pb.collection("payments").update(payment.id, {
          created_by: otherUserId,
        }),
      ).rejects.toThrow();

      const reloaded = await pb.collection("payments").getOne(payment.id);
      expect(reloaded.created_by).toBe(authUserId);
    });

    it("still allows a legitimate update to an unrelated rentals field (guard is scoped, not a full lockdown)", async () => {
      const rental = await createActiveRental();

      const updated = await pb.collection("rentals").update(rental.id, {
        deposit_amount: 1500,
      });

      expect(updated.deposit_amount).toBe(1500);
    });
  },
);
