// @vitest-environment node
//
// Runs under Node, not jsdom (the project default): this file does real
// network I/O (fetch + multipart FormData) against a live PocketBase, and
// jsdom's FormData/File classes don't reliably interoperate with Node's
// native fetch (undici) for multipart bodies — confirmed live (a jsdom
// FormData caused PocketBase to reject the request with "400: Unsupported
// Content-Type"). No DOM is needed here anyway.
import { beforeAll, describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §30 (integration tests ligeros contra una instancia local de
 * PocketBase) + CU4's last scenario ("El cliente no puede forzar su propio
 * folio ni status"). Task 1.10.
 *
 * This exercises the REAL server-side guards from tasks 1.1/1.2 — the
 * `:isset` API Rules and `pb_hooks/rentals_folio.pb.js` — against an actual
 * running PocketBase, not a mock. It needs a local instance with this
 * repo's `pb_migrations/`/`pb_hooks/` applied (see `pb_migrations/README.md`
 * for how to run one); `npm test` on a machine without one running simply
 * skips this file rather than failing the whole suite, since the
 * PocketBase binary is intentionally not part of this repo/CI (gitignored
 * `pb_data/`, no committed binary).
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
  "rentals create — server-side guards against a live PocketBase (CU4, task 1.10)",
  () => {
    let pb: PocketBase;
    let customerId: string;
    let authUserId: string;

    beforeAll(async () => {
      // Phase 4 task 4.2: users.createRule is now admin-panel-only (see
      // pb_migrations/1787760000_users_phone_identity.js) — throwaway test
      // users are created via a superuser session (src/data/testSupport.ts),
      // never the public create endpoint.
      const testUser = await createTestUser(PB_URL, "5");
      pb = testUser.client;
      authUserId = testUser.userId;

      const uniqueSuffix = Date.now().toString().slice(-9);

      // Built as FormData explicitly (matching customers.repo.ts, task
      // 1.4) rather than relying on the SDK's own File-in-object
      // auto-detection, which doesn't reliably trigger multipart encoding
      // for jsdom's File implementation in this test environment.
      // PocketBase sniffs real file content for `mimeTypes` validation, not
      // just the declared Content-Type — a handful of arbitrary bytes gets
      // correctly rejected as not actually a PNG. This is a real (if
      // minimal) 1x1 transparent PNG.
      const minimalPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const pngBytes = Uint8Array.from(atob(minimalPngBase64), (char) =>
        char.charCodeAt(0),
      );

      const formData = new FormData();
      formData.append("name", "Cliente de prueba (integración)");
      formData.append("phone", `5${uniqueSuffix.slice(1, 9)}9`);
      formData.append(
        "credential_photo",
        new File([pngBytes], "credencial.png", { type: "image/png" }),
      );
      const customer = await pb.collection("customers").create(formData);
      customerId = customer.id;
    });

    it("assigns a server-generated sequential folio and forces status=ACTIVE, created_by/updated_by from auth (§11.1, §19.1, §26)", async () => {
      const rental = await pb.collection("rentals").create({
        customer_id: customerId,
        initial_rent_amount: 2800,
        deposit_amount: 1000,
      });

      expect(rental.folio).toMatch(/^R-\d{6}$/);
      expect(rental.status).toBe("ACTIVE");
      expect(rental.created_by).toBe(authUserId);
      expect(rental.updated_by).toBe(authUserId);
    });

    it("rejects a create request that includes a client-set folio and status (CU4)", async () => {
      await expect(
        pb.collection("rentals").create({
          customer_id: customerId,
          initial_rent_amount: 999,
          folio: "R-999999",
          status: "RETURNED",
        }),
      ).rejects.toThrow();
    });

    it("rejects an anonymous (unauthenticated) create", async () => {
      const anon = new PocketBase(PB_URL);

      await expect(
        anon.collection("rentals").create({
          customer_id: customerId,
          initial_rent_amount: 100,
        }),
      ).rejects.toThrow();
    });

    it("rejects a direct client update of status (must go through the return endpoint, §19.1 — Phase 3)", async () => {
      const rental = await pb.collection("rentals").create({
        customer_id: customerId,
        initial_rent_amount: 500,
      });

      await expect(
        pb
          .collection("rentals")
          .update(rental.id, { status: "RETURNED" }),
      ).rejects.toThrow();
    });
  },
);
