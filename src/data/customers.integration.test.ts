// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts (task 1.10): real network
// I/O (fetch + multipart FormData) against a live PocketBase, which
// jsdom's FormData/File don't reliably support with Node's native fetch.
import { beforeEach, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §15 (manejo de credenciales — archivo protegido, file token) +
 * §21/Anexo A.5 ("credencial pendiente" — Phase 3 fix, credential_photo is
 * now `required: false`) + CU7. Task 3.7.
 *
 * Exercises the real protected-file behavior against an actual running
 * PocketBase, not a mock — same skip-gracefully-if-no-instance behavior
 * as rentals.integration.test.ts (task 1.10). See `pb_migrations/README.md`
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
  "customers create + credential_photo protection against a live PocketBase (CU7, Phase 3 fix, task 3.7)",
  () => {
    let pb: PocketBase;

    beforeEach(async () => {
      // Phase 4 task 4.2: users.createRule is now admin-panel-only (see
      // pb_migrations/1787760000_users_phone_identity.js) — throwaway test
      // users are created via a superuser session (src/data/testSupport.ts),
      // never the public create endpoint.
      const testUser = await createTestUser(PB_URL, "9");
      pb = testUser.client;
    });

    // Real production-relevant regression test for the required-vs-optional
    // conflict flagged by Phase 0/1/2's own sdd-verify passes (SDD.md §11
    // line 268-273/§602 said "requerido al crear", contradicting §21's
    // failure table and Anexo A.5). Before this Phase 3 fix, this exact
    // request would 400.
    it("creates a customer with NO credential_photo — 'credencial pendiente', not blocked (§21/Anexo A.5)", async () => {
      const uniqueSuffix = Date.now().toString().slice(-9);

      const customer = await pb.collection("customers").create({
        name: "Cliente sin credencial",
        phone: `6${uniqueSuffix}`.slice(0, 10),
      });

      expect(customer.credential_photo).toBe("");

      // And a rental can be created against this "credencial pendiente"
      // customer just as normally — Anexo A.5's whole point.
      const rental = await pb.collection("rentals").create({
        customer_id: customer.id,
        initial_rent_amount: 1500,
      });
      expect(rental.status).toBe("ACTIVE");
    });

    describe("protected credential_photo file access (§15, CU7)", () => {
      let customerId: string;
      let filename: string;

      beforeEach(async () => {
        const minimalPngBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        const pngBytes = Uint8Array.from(atob(minimalPngBase64), (char) =>
          char.charCodeAt(0),
        );

        const uniqueSuffix = Date.now().toString().slice(-9);
        const formData = new FormData();
        formData.append("name", "Cliente con credencial");
        formData.append("phone", `7${uniqueSuffix}`.slice(0, 10));
        formData.append(
          "credential_photo",
          new File([pngBytes], "credencial.png", { type: "image/png" }),
        );

        const customer = await pb.collection("customers").create(formData);
        customerId = customer.id;
        filename = customer.credential_photo;
      });

      it("403s (PocketBase returns 404 for protected files without a valid token) when no token is provided, even authenticated", async () => {
        const response = await fetch(
          `${PB_URL}/api/files/customers/${customerId}/${filename}`,
          { headers: { Authorization: `Bearer ${pb.authStore.token}` } },
        );

        expect(response.ok).toBe(false);
        expect([403, 404]).toContain(response.status);
      });

      it("403s (404) for a completely unauthenticated request with no token", async () => {
        const response = await fetch(
          `${PB_URL}/api/files/customers/${customerId}/${filename}`,
        );

        expect(response.ok).toBe(false);
        expect([403, 404]).toContain(response.status);
      });

      it("succeeds with a valid short-lived file token from pb.files.getToken() (CU7 second scenario)", async () => {
        const token = await pb.files.getToken();
        expect(token).toBeTruthy();

        const url = pb.files.getURL(
          { id: customerId, collectionId: "customers", collectionName: "customers" },
          filename,
          { token },
        );

        const response = await fetch(url);
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
      });

      it("does not surface credential_photo in a list/search response used elsewhere (§15: no aparece en listados — spot check)", async () => {
        // Not a hidden field structurally (PocketBase doesn't support
        // per-field response filtering that way) — this documents the
        // actual guarantee: the filename alone is useless without a fresh
        // token, so no listing screen can render the image just by
        // including this field.
        const list = await pb.collection("customers").getList(1, 1, {
          filter: pb.filter("id = {:id}", { id: customerId }),
        });

        expect(list.items[0].credential_photo).toBe(filename);

        const bareResponse = await fetch(
          `${PB_URL}/api/files/customers/${customerId}/${list.items[0].credential_photo}`,
        );
        expect(bareResponse.ok).toBe(false);
      });
    });
  },
);
