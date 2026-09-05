// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts: real network I/O against a
// live PocketBase, exercising the actual client SDK + server behavior, not a
// mock.
import { describe, expect, it } from "vitest";
import { createTestUser } from "@/data/testSupport";
import { createRental } from "@/data/rentals.repo";
import { pb } from "@/data/pocketbaseClient";

/**
 * Gap-fill: Deposit Payment Creation Failure (found live, 2026-08-27, while
 * the user was testing "Nueva renta" on a real device). §7.1/CU4 + §21.
 *
 * A rental with `deposit_amount > 0` and 2+ selected products failed to
 * register its deposit payment on all 3 real attempts, each time showing
 * `RentalNewScreen`'s generic "No se pudo guardar la renta..." message. Live
 * inspection of PocketBase's own `_logs` table proved the rental and BOTH
 * `rental_items` writes succeeded server-side (200/200/200) while the
 * `payments` create was never even attempted (zero log entries, not even a
 * rejected one) — the failure happened client-side, before the fetch call.
 *
 * **Confirmed root cause** (reproduced deterministically against a scratch
 * PocketBase instance before this fix landed): `createRental`'s
 * `Promise.all` over `rental_items` creates fires 2+ concurrent `POST`
 * requests to the exact same collection endpoint
 * (`/api/collections/rental_items/records`). The PocketBase JS SDK's default
 * auto-cancellation (`pb.autoCancellation`, enabled by default) shares one
 * request key per `method+URL` when no explicit `requestKey` is passed — so
 * firing a second `create()` call to the same endpoint aborts whichever
 * earlier one is still pending, via `ClientResponseError({isAbort: true,
 * message: "The request was autocancelled..."})`, thrown from inside
 * `Promise.all` BEFORE the code ever reaches the deposit-payment step. This
 * exact SDK gotcha was already independently discovered and worked around in
 * `src/data/rentals-folio-concurrency.integration.test.ts` (its own
 * `pb.autoCancellation(false)`) — but never fixed in this production code
 * path until this gap-fill.
 *
 * This test exercises the REAL `createRental()` (not a hand-rolled repro)
 * against a real running PocketBase — same skip-gracefully-if-no-instance
 * pattern as every other live-integration test in this repo. See
 * `pb_migrations/README.md` for how to run one locally.
 *
 * **Unlike every other `*.integration.test.ts` in this repo**, this one
 * authenticates the app-wide SHARED `pb` singleton from
 * `src/data/pocketbaseClient.ts` (via `pb.collection("users")
 * .authWithPassword(...)`, exactly like `src/data/auth.repo.ts#loginWithPassword`)
 * instead of `createTestUser`'s own separate `client` — because
 * `createRental()` (the function under test) always imports and uses that
 * shared singleton internally, never a caller-provided client. Using
 * `testUser.client` here would leave the shared singleton unauthenticated
 * and fail every write with a misleading "create rule failure" 400 that has
 * nothing to do with this gap-fill's actual bug.
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
  "createRental — deposit payment race, live PocketBase (gap-fill: Deposit Payment Creation Failure)",
  () => {
    it("reliably creates the deposit payment for a rental with 2+ items and deposit_amount > 0 (reproduces the exact live bug: 2 rental_items + a real deposit, submitted through the same createRental() the UI calls)", async () => {
      const testUser = await createTestUser(PB_URL, "8");
      await pb
        .collection("users")
        .authWithPassword(testUser.phone, testUser.password);

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (deposit payment race)",
        phone: `8${uniqueSuffix}`.slice(0, 10),
      });

      const result = await createRental({
        customerId: customer.id,
        items: [
          { itemType: "concentrator", quantity: 1 },
          { itemType: "tank", quantity: 1 },
        ],
        initialRentAmount: 2800,
        depositAmount: 12000,
      });

      expect(result.rental.folio).toMatch(/^R-\d{3,}$/);
      expect(result.items).toHaveLength(2);
      expect(result.depositPayment).not.toBeNull();
      expect(result.depositPayment?.amount).toBe(12000);
      expect(result.depositPayment?.payment_type).toBe("deposit");

      // The deposit payment must actually be persisted server-side, not just
      // returned by a client-side value — reload it fresh.
      const reloadedPayments = await pb.collection("payments").getFullList({
        filter: pb.filter("rental_id = {:rentalId}", {
          rentalId: result.rental.id,
        }),
      });
      expect(reloadedPayments).toHaveLength(1);
      expect(reloadedPayments[0].payment_type).toBe("deposit");
      expect(reloadedPayments[0].amount).toBe(12000);
    });

    it("still creates all 3 rental_items when 3+ products are selected, deposit payment included (broader concurrency, not just the 2-item case)", async () => {
      const testUser = await createTestUser(PB_URL, "9");
      await pb
        .collection("users")
        .authWithPassword(testUser.phone, testUser.password);

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (deposit payment race, 3 items)",
        phone: `9${uniqueSuffix}`.slice(0, 10),
      });

      const result = await createRental({
        customerId: customer.id,
        items: [
          { itemType: "concentrator", quantity: 1 },
          { itemType: "concentrator", quantity: 1 },
          { itemType: "tank", quantity: 1 },
        ],
        initialRentAmount: 2800,
        depositAmount: 5000,
      });

      expect(result.items).toHaveLength(3);
      expect(result.depositPayment).not.toBeNull();
    });
  },
);
