// @vitest-environment node
//
// Same reasoning as deposit-returned-guard.integration.test.ts /
// audit-fields.integration.test.ts: real network I/O against a live
// PocketBase, exercising the actual server-side guard, not a mock.
import { beforeEach, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §7.2 (flujo Registrar pago) + §19.1 (`rentals.status`
 * server-resuelto) + §24 (sin sincronización en tiempo real entre los 6
 * usuarios). Gap-fill finding 1 (third and final SDD-vs-code audit pass): a
 * payment could be registered on an already-RETURNED rental.
 *
 * `pb_hooks/payments_validate.pb.js`'s `onRecordCreateRequest` handler never
 * loaded the parent rental or checked its `status` — it only enforced the
 * adjustment-note rule and stamped `created_by`. Client-side,
 * `RentalDetailSheet.tsx` only renders "Registrar pago" while
 * `status === "ACTIVE"` (a render-time gate), but §24 explicitly documents
 * no realtime sync across the 6 shared devices: if `PaymentDialog` is
 * already open when another user closes the same rental on their own
 * device, the first user's submit reached the server with nothing stopping
 * it from succeeding on an already-RETURNED rental. This test proves the
 * gap is closed WITHOUT breaking the legitimate ACTIVE-rental case.
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
  "payments create — rejects payments on a non-ACTIVE rental (§7.2/§19.1/§24, gap-fill finding 1)",
  () => {
    let pb: PocketBase;
    let customerId: string;

    beforeEach(async () => {
      // Phase 4 task 4.2: users.createRule is now admin-panel-only (see
      // pb_migrations/1787760000_users_phone_identity.js) — throwaway test
      // users are created via a superuser session (src/data/testSupport.ts),
      // never the public create endpoint.
      const testUser = await createTestUser(PB_URL, "8");
      pb = testUser.client;

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (payment race guard)",
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

    it("still allows a payment on an ACTIVE rental (regression)", async () => {
      const rental = await createActiveRental();

      const payment = await pb.collection("payments").create({
        rental_id: rental.id,
        amount: 500,
        payment_type: "rent",
      });

      expect(payment.amount).toBe(500);
      expect(payment.rental_id).toBe(rental.id);
    });

    it("rejects a payment attempt on a RETURNED rental with a clear error", async () => {
      const rental = await createActiveRental();

      await pb.send(`/api/rentals/${rental.id}/return`, {
        method: "POST",
        body: { amount_collected: 2800, deposit_returned: 1000 },
      });

      await expect(
        pb.collection("payments").create({
          rental_id: rental.id,
          amount: 500,
          payment_type: "rent",
        }),
      ).rejects.toThrow(/devuelta|no está activa|activa/i);

      const payments = await pb.collection("payments").getFullList({
        filter: pb.filter("rental_id = {:rentalId} && amount = 500", {
          rentalId: rental.id,
        }),
      });
      expect(payments).toHaveLength(0);
    });
  },
);
