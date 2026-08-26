// @vitest-environment node
//
// Real network I/O against a live PocketBase, exercising the actual
// `users` collection API Rules, not a mock.
import { describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §14 (Autenticación) — Phase 4 task 4.2 (Full API Rules review).
 *
 * §14 is explicit: "Alta de usuarios: manual, por el administrador técnico,
 * desde el panel admin de PocketBase (superusuario). No hay pantalla de
 * auto-registro en la PWA." The PWA itself never renders a registration
 * screen, but that alone does not stop a client that talks to the API
 * directly — PocketBase's `users` auth collection ships with a public
 * (open) `createRule` by default, which this task's audit found was never
 * overridden by `pb_migrations/1787760000_users_phone_identity.js`.
 *
 * Confirmed live BEFORE this task's fix: an anonymous `POST
 * /api/collections/users/records` request succeeded and created a real,
 * fully authenticated account — meaning anyone who discovered the API URL
 * could self-register and, per §14's own "todo usuario autenticado tiene
 * los mismos permisos operativos" (section 14, last line) and §13's
 * "acceso solo para usuarios autenticados del negocio", immediately gain
 * full read/write access to every customer/rental/payment record. This is
 * the same category of "client-controlled field the API must never trust"
 * problem §13/§26 solve for `rentals`/`payments`, applied to account
 * creation itself.
 *
 * Fix: `createRule: null` on the `users` collection, mirroring the
 * `deleteRule: null` pattern already used on every other collection for
 * "solo el administrador técnico desde el panel admin" (§13). Login
 * (`authWithPassword`) is unaffected — `createRule` only gates the
 * record-create endpoint, not authentication.
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
  "users collection — no public self-registration via the API (§14, task 4.2)",
  () => {
    it("rejects an anonymous attempt to create a new user account", async () => {
      const anon = new PocketBase(PB_URL);
      const uniqueSuffix = Date.now().toString().slice(-9);

      await expect(
        anon.collection("users").create({
          email: `phase4-selfreg-${uniqueSuffix}@insumoso2.local`,
          password: "Passw0rd!2026",
          passwordConfirm: "Passw0rd!2026",
          phone: `3${uniqueSuffix}`.slice(0, 10),
          name: "Should Never Be Created",
        }),
      ).rejects.toThrow();
    });

    it("rejects even an authenticated user from creating a second account (admin-panel-only, §14)", async () => {
      // The "authenticated user" here is created via a superuser session
      // (src/data/testSupport.ts), not the public create endpoint — the
      // whole point of this test is that the public endpoint stays closed
      // even for an existing, legitimately authenticated business user.
      const { client } = await createTestUser(PB_URL, "2");
      const uniqueSuffix = Date.now().toString().slice(-9);

      await expect(
        client.collection("users").create({
          email: `phase4-authed-selfreg-${uniqueSuffix}@insumoso2.local`,
          password: "Passw0rd!2026",
          passwordConfirm: "Passw0rd!2026",
          phone: `1${uniqueSuffix}`.slice(0, 10),
          name: "Should Also Never Be Created",
        }),
      ).rejects.toThrow();
    });
  },
);
