// @vitest-environment node
//
// Real network I/O against a live PocketBase, exercising the actual custom
// route, not a mock.
import { describe, expect, it } from "vitest";
import { createTestUser, getSuperuserClient } from "@/data/testSupport";

/**
 * SDD.md §14 (Autenticación) + §16.6 — Gap-fill fix (found post-Phase-5,
 * not covered by any original SDD §35 phase task): the real `LoginScreen`
 * needs a public directory of `{id, name, phone}` for every business user
 * BEFORE the visitor is authenticated, since `pb_hooks/login_directory.pb.js`
 * (`GET /api/login-directory`) is the only endpoint that can serve that —
 * `users.listRule` stays self-only on purpose (see that file's docblock).
 *
 * This test proves, against a live instance:
 *   1. An anonymous request succeeds (200) with zero users authenticated —
 *      the whole point of the route.
 *   2. The response is exactly `[{id, name, phone, avatar}]` per user, no
 *      other field (`email`/`verified`/etc. must NOT leak — see this
 *      route's own docblock for why `avatar` moved from "excluded" to
 *      "included", Redesign — UX/UI pass).
 *   3. It reflects real seeded users, not a hardcoded/stubbed list.
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
  "GET /api/login-directory — public login picker directory (§14, gap-fill)",
  () => {
    it("returns 200 with zero users authenticated (truly public, no auth header sent)", async () => {
      const response = await fetch(`${PB_URL}/api/login-directory`);

      expect(response.status).toBe(200);
    });

    it("returns exactly {id, name, phone, avatar} for every seeded user, no other field", async () => {
      const seeded = await createTestUser(PB_URL, "9");

      const response = await fetch(`${PB_URL}/api/login-directory`);
      const body = (await response.json()) as Array<{
        id: string;
        name: string;
        phone: string;
        avatar: string;
      }>;

      expect(Array.isArray(body)).toBe(true);

      const entry = body.find((user) => user.id === seeded.userId);
      expect(entry).toBeDefined();
      // Exactly these 4 keys — no email/verified/created/etc leak.
      expect(Object.keys(entry!).sort()).toEqual([
        "avatar",
        "id",
        "name",
        "phone",
      ]);
      expect(typeof entry!.name).toBe("string");
      expect(typeof entry!.phone).toBe("string");
      // A freshly seeded test user never has an avatar uploaded — the field
      // is still present (empty string), never omitted.
      expect(entry!.avatar).toBe("");
      expect(entry!.name.length).toBeGreaterThan(0);
      expect(entry!.phone.length).toBeGreaterThan(0);
    });

    it("includes multiple distinct users, not a single hardcoded entry", async () => {
      const first = await createTestUser(PB_URL, "9a");
      const second = await createTestUser(PB_URL, "9b");

      const response = await fetch(`${PB_URL}/api/login-directory`);
      const body = (await response.json()) as Array<{ id: string }>;
      const ids = body.map((user) => user.id);

      expect(ids).toContain(first.userId);
      expect(ids).toContain(second.userId);
    });
  },
);

/**
 * SDD.md §14 — Gap-fill fix, explicit user request: `pb_migrations/
 * 1787760000_users_phone_identity.js` sets `email`'s `required` to `false`
 * so the superuser creating each of the 6 real accounts from the admin
 * panel doesn't have to invent an email address. Proven directly against
 * the live schema (not assumed from reading the migration file): a
 * superuser can create a `users` record with NO `email` field at all.
 */
describe.skipIf(!reachable)(
  "users.email is optional (§14, gap-fill — email no longer required)",
  () => {
    it("lets a superuser create a user record with no email field at all", async () => {
      const superuser = await getSuperuserClient(PB_URL);

      const uniqueSuffix = Date.now().toString().slice(-9);
      const created = await superuser.collection("users").create({
        password: "test-password-12345",
        passwordConfirm: "test-password-12345",
        phone: `7${uniqueSuffix}`.slice(0, 10),
        name: "Usuario sin email (gap-fill)",
        // deliberately no `email` field
      });

      expect(created.id).toBeTruthy();
      expect(created.email).toBe("");
    });
  },
);
