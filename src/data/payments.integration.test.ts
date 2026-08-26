// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts (task 1.10): real network
// I/O (fetch + multipart FormData for the customer's credential photo)
// against a live PocketBase, which jsdom's FormData/File don't reliably
// support with Node's native fetch.
import { beforeAll, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";

/**
 * SDD.md §20 (validación server-side) + §11.2 (payment_type) + §26
 * (auditoría) + CU5's last scenario ("Ajuste sin nota es rechazado"). Task
 * 2.8.
 *
 * Exercises the real server-side guards from task 2.2
 * (`pb_hooks/payments_validate.pb.js` + the payments migration's
 * `created_by:isset=false` guard) against an actual running PocketBase, not
 * a mock — same skip-gracefully-if-no-instance behavior as
 * rentals.integration.test.ts (task 1.10). See `pb_migrations/README.md`
 * for how to run one locally.
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
  "payments create — server-side guards against a live PocketBase (CU5, task 2.8)",
  () => {
    let pb: PocketBase;
    let rentalId: string;
    let authUserId: string;

    beforeAll(async () => {
      pb = new PocketBase(PB_URL);

      // Unique per run so repeated local test runs never collide on the
      // unique `phone` index (§14).
      const uniqueSuffix = Date.now().toString().slice(-9);
      const phone = `6${uniqueSuffix}`;
      const email = `phase2-integration-${uniqueSuffix}@insumoso2.local`;
      const password = "Passw0rd!2026";

      await pb.collection("users").create({
        email,
        password,
        passwordConfirm: password,
        phone,
        name: "Phase 2 Integration Test User",
      });

      const auth = await pb
        .collection("users")
        .authWithPassword(phone, password);
      authUserId = auth.record.id;

      const minimalPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const pngBytes = Uint8Array.from(atob(minimalPngBase64), (char) =>
        char.charCodeAt(0),
      );

      const customerForm = new FormData();
      customerForm.append("name", "Cliente de prueba (Fase 2)");
      customerForm.append("phone", `6${uniqueSuffix.slice(1, 9)}9`);
      customerForm.append(
        "credential_photo",
        new File([pngBytes], "credencial.png", { type: "image/png" }),
      );
      const customer = await pb
        .collection("customers")
        .create(customerForm);

      const rental = await pb.collection("rentals").create({
        customer_id: customer.id,
        initial_rent_amount: 2800,
        deposit_amount: 1000,
      });
      rentalId = rental.id;
    });

    it("rejects an adjustment payment without a note (CU5's last scenario)", async () => {
      await expect(
        pb.collection("payments").create({
          rental_id: rentalId,
          amount: -200,
          payment_type: "adjustment",
        }),
      ).rejects.toThrow();
    });

    it("rejects an adjustment payment with a blank note", async () => {
      await expect(
        pb.collection("payments").create({
          rental_id: rentalId,
          amount: -200,
          payment_type: "adjustment",
          note: "   ",
        }),
      ).rejects.toThrow();
    });

    it("accepts an adjustment payment with a note, keeping the original payment untouched (CU5)", async () => {
      const original = await pb.collection("payments").create({
        rental_id: rentalId,
        amount: 3000,
        payment_type: "rent",
      });

      const adjustment = await pb.collection("payments").create({
        rental_id: rentalId,
        amount: -200,
        payment_type: "adjustment",
        note: "se cobró de más por error",
      });

      const reloadedOriginal = await pb
        .collection("payments")
        .getOne(original.id);

      expect(adjustment.amount).toBe(-200);
      expect(adjustment.note).toBe("se cobró de más por error");
      expect(reloadedOriginal.amount).toBe(3000);
    });

    it("forces created_by from the authenticated user, rejecting a client-set value (§26)", async () => {
      await expect(
        pb.collection("payments").create({
          rental_id: rentalId,
          amount: 100,
          payment_type: "rent",
          created_by: "someone-else",
        }),
      ).rejects.toThrow();

      const payment = await pb.collection("payments").create({
        rental_id: rentalId,
        amount: 100,
        payment_type: "rent",
      });

      expect(payment.created_by).toBe(authUserId);
    });
  },
);
