// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts (task 1.10): real network
// I/O against a live PocketBase, exercising the actual custom route
// (pb_hooks/rentals_return.pb.js, task 3.1), not a mock.
import { beforeEach, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §19.1 (`status`/`returned_at`/`returned_by` resueltos
 * server-side) + §7.3 + CU6. Task 3.6.
 *
 * Exercises the real `POST /api/rentals/{id}/return` endpoint (task 3.1)
 * against an actual running PocketBase, not a mock — same skip-gracefully-
 * if-no-instance behavior as rentals.integration.test.ts (task 1.10). See
 * `pb_migrations/README.md` for how to run one locally.
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
  "POST /api/rentals/{id}/return — server-side guards against a live PocketBase (CU6, task 3.6)",
  () => {
    let pb: PocketBase;
    let customerId: string;
    let authUserId: string;

    beforeEach(async () => {
      // Phase 4 task 4.2: users.createRule is now admin-panel-only (see
      // pb_migrations/1787760000_users_phone_identity.js) — throwaway test
      // users are created via a superuser session (src/data/testSupport.ts),
      // never the public create endpoint.
      const testUser = await createTestUser(PB_URL, "7");
      pb = testUser.client;
      authUserId = testUser.userId;

      const uniqueSuffix = Date.now().toString().slice(-9) + Math.floor(
        Math.random() * 100,
      );

      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (devolución)",
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

    it("sets status=RETURNED, returned_at and returned_by server-side, and creates the final payment (CU6 second scenario)", async () => {
      const rental = await createActiveRental();

      const returned = await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 2800, deposit_returned: 1000 },
      });

      expect(returned.status).toBe("RETURNED");
      expect(returned.returned_at).toBeTruthy();
      expect(returned.returned_by).toBe(authUserId);
      expect(returned.deposit_returned_amount).toBe(1000);

      const payments = await pb.collection("payments").getFullList({
        filter: pb.filter("rental_id = {:rentalId}", { rentalId: rental.id }),
      });
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(2800);
      expect(payments[0].payment_type).toBe("rent");
      expect(payments[0].created_by).toBe(authUserId);
    });

    it("allows a custom amount that differs from the suggestion, without requiring justification (CU6 third scenario)", async () => {
      const rental = await createActiveRental();

      const returned = await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 5000, deposit_returned: 1000 },
      });

      expect(returned.status).toBe("RETURNED");

      const payments = await pb.collection("payments").getFullList({
        filter: pb.filter("rental_id = {:rentalId}", { rentalId: rental.id }),
      });
      expect(payments[0].amount).toBe(5000);
    });

    it("does not create a payment when amount_collected is 0", async () => {
      const rental = await createActiveRental();

      await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 0, deposit_returned: 1000 },
      });

      const payments = await pb.collection("payments").getFullList({
        filter: pb.filter("rental_id = {:rentalId}", { rentalId: rental.id }),
      });
      expect(payments).toHaveLength(0);
    });

    it("rejects a second return attempt on an already-RETURNED rental (CU6's last scenario)", async () => {
      const rental = await createActiveRental();

      await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 2800, deposit_returned: 1000 },
      });

      await expect(
        pb.send(`/api/rentals/${rental.id}/return`, {
          method: "POST",
          body: { amount_collected: 100, deposit_returned: 0 },
        }),
      ).rejects.toThrow();

      // The first return's fields are untouched by the rejected second
      // attempt.
      const reloaded = await pb.collection("rentals").getOne(rental.id);
      expect(reloaded.deposit_returned_amount).toBe(1000);
    });

    it("rejects an anonymous (unauthenticated) return request", async () => {
      const rental = await createActiveRental();
      const anon = new PocketBase(PB_URL);

      await expect(
        anon.send(`/api/rentals/${rental.id}/return`, {
          method: "POST",
          body: { amount_collected: 100, deposit_returned: 0 },
        }),
      ).rejects.toThrow();

      const reloaded = await pb.collection("rentals").getOne(rental.id);
      expect(reloaded.status).toBe("ACTIVE");
    });

    it("404s for a nonexistent rental id", async () => {
      await expect(
        pb.send("/api/rentals/nonexistent000000000/return", {
          method: "POST",
          body: { amount_collected: 100, deposit_returned: 0 },
        }),
      ).rejects.toThrow();
    });

    it("still rejects a direct client PATCH of status even after the rental was created (defense in depth alongside the return endpoint)", async () => {
      const rental = await createActiveRental();

      await expect(
        pb.collection("rentals").update(rental.id, { status: "RETURNED" }),
      ).rejects.toThrow();
    });
  },
);
