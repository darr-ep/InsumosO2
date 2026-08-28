// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts: real network I/O against a
// live PocketBase, exercising the actual PocketBase relation-filter syntax,
// not a mock/assumption.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser } from "@/data/testSupport";
import { createRental, returnRental, listActiveRentalItems } from "@/data/rentals.repo";
import { pb } from "@/data/pocketbaseClient";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). `listActiveRentalItems`
 * feeds `DashboardStats`' "Concentradores disponibles"/"Tanques disponibles"
 * tiles — it must return `rental_items` scoped to ONLY currently-ACTIVE
 * rentals, across ALL rentals (not one rental like `listItemsForRental`).
 *
 * This proves the PocketBase dot-notation relation filter
 * (`rental_id.status = "ACTIVE"`) actually works against `rental_items`
 * (whose `rental_id` is a relation to `rentals`) — the same mechanism
 * `searchRentals` already proves live for `customer_id.name`/
 * `customer_id.phone` — rather than assuming the syntax generalizes to a
 * different collection/relation without checking. Confirmed live against a
 * scratch PocketBase v0.40.1 instance (isolated `--dir`, separate port —
 * never the shared dev instance on 8090) before this file's assertions were
 * trusted.
 *
 * Same skip-gracefully-if-no-instance pattern as every other
 * `*.integration.test.ts` in this repo. See `pb_migrations/README.md`.
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
  "listActiveRentalItems — live PocketBase (Redesign Round 2, Batch 4)",
  () => {
    let customerId: string;

    beforeAll(async () => {
      // `createRental`/`returnRental` (the functions under test alongside
      // `listActiveRentalItems`) always use the shared `pb` singleton
      // internally, never a caller-provided client — same reasoning as
      // rentals-deposit-payment-race.integration.test.ts's own docblock.
      const testUser = await createTestUser(PB_URL, "6");
      await pb
        .collection("users")
        .authWithPassword(testUser.phone, testUser.password);

      const superuser = await (
        await import("@/data/testSupport")
      ).getSuperuserClient(PB_URL);
      const uniqueSuffix = Date.now().toString().slice(-9);
      const minimalPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const pngBytes = Uint8Array.from(atob(minimalPngBase64), (char) =>
        char.charCodeAt(0),
      );
      const formData = new FormData();
      formData.append("name", "Cliente disponibilidad (integración)");
      formData.append("phone", `6${uniqueSuffix.slice(1, 9)}9`);
      formData.append(
        "credential_photo",
        new File([pngBytes], "credencial.png", { type: "image/png" }),
      );
      const customer = await superuser.collection("customers").create(formData);
      customerId = customer.id;
    });

    it("includes items from ACTIVE rentals but excludes items from RETURNED rentals", async () => {
      const activeRental = await createRental({
        customerId,
        items: [
          { itemType: "concentrator", quantity: 2 },
          { itemType: "tank", quantity: 1 },
        ],
        initialRentAmount: 2800,
        depositAmount: 0,
        extras: [],
      });

      const rentalToReturn = await createRental({
        customerId,
        items: [{ itemType: "tank", quantity: 5 }],
        initialRentAmount: 1500,
        depositAmount: 0,
        extras: [],
      });
      await returnRental({
        rentalId: rentalToReturn.rental.id,
        amountCollected: 1500,
        depositReturned: 0,
      });

      const items = await listActiveRentalItems();

      const activeRentalIds = new Set(items.map((item) => item.rental_id));
      expect(activeRentalIds.has(activeRental.rental.id)).toBe(true);
      expect(activeRentalIds.has(rentalToReturn.rental.id)).toBe(false);

      const concentratorQty = items
        .filter(
          (item) =>
            item.rental_id === activeRental.rental.id &&
            item.item_type === "concentrator",
        )
        .reduce((sum, item) => sum + item.quantity, 0);
      const tankQty = items
        .filter(
          (item) =>
            item.rental_id === activeRental.rental.id &&
            item.item_type === "tank",
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      expect(concentratorQty).toBe(2);
      expect(tankQty).toBe(1);
    });
  },
);
