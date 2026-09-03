// @vitest-environment node
//
// Real network I/O against a live PocketBase, exercising the actual
// `users` collection's own-password-change semantics, not a mock.
import { beforeAll, describe, expect, it } from "vitest";
import PocketBase, { ClientResponseError } from "pocketbase";
import { createTestUser } from "@/data/testSupport";

/**
 * New gap-fill feature: Self-Service Profile Screen (business owner request,
 * not in the original SDD §35 phase breakdown). §14 documents login but says
 * nothing about a signed-in user changing their OWN password later, so this
 * is verified live rather than assumed, per this repo's own house rule
 * (pb_migrations/README.md).
 *
 * Confirmed live (2026-09-01) against a local PocketBase v0.40.1 instance:
 *
 * 1. `users.password` has `min: 8` (PocketBase's own default, not overridden
 *    by any migration here) — `src/domain/auth/profile.ts`'s Zod schema
 *    mirrors this exact number instead of guessing.
 * 2. A non-superuser session changing its OWN password/passwordConfirm MUST
 *    also send the correct `oldPassword` — omitting it, or sending the wrong
 *    value, is rejected with a 400.
 * 3. On a successful password change, PocketBase rotates the record's
 *    `tokenKey`, which immediately invalidates every previously-issued auth
 *    token for that user server-side — including the token the very
 *    request that made the change was using. This is the EXACT SAME class
 *    of bug `src/data/staleSession.ts` already documents for a different
 *    trigger (found live 2026-08-27): `pb.authStore.isValid` only checks the
 *    JWT's local `exp` claim, never round-trips to the server, so it STAYS
 *    `true` right after this call even though the token is now dead
 *    server-side (proven below: the old token can no longer authenticate a
 *    fresh request). Left alone, the app would keep rendering as "logged
 *    in" until some later unrelated write hit that dead token and got
 *    silently bounced to `/login` with the generic "Tu sesión expiró"
 *    message — confusing, since by then the visitor has forgotten they
 *    changed their password.
 *
 *    `src/data/auth.repo.ts#changeOwnPassword` avoids that by proactively
 *    calling `loginWithPassword(phone, newPassword)` right after a
 *    successful change, so a fresh valid session is in place before the
 *    Profile screen ever tries another request. This was chosen over
 *    reusing the generic stale-session redirect/message specifically
 *    because that message ("Tu sesión expiró. Vuelve a entrar.") would be
 *    inaccurate and more jarring here — the visitor didn't do anything
 *    wrong, they just changed their own password on purpose.
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
  "users collection — self password change semantics (gap-fill, Profile screen)",
  () => {
    let client: PocketBase;
    let userId: string;
    let phone: string;
    const originalPassword = "Passw0rd!2026";
    const newPassword = "Passw0rd!2026New";

    beforeAll(async () => {
      const testUser = await createTestUser(PB_URL, "9");
      client = testUser.client;
      userId = testUser.userId;
      phone = testUser.phone;
    });

    it("rejects a password change when oldPassword is wrong", async () => {
      await expect(
        client.collection("users").update(userId, {
          oldPassword: "definitely-wrong",
          password: newPassword,
          passwordConfirm: newPassword,
        }),
      ).rejects.toThrow(ClientResponseError);
    });

    it("rejects a password change when oldPassword is missing entirely", async () => {
      await expect(
        client.collection("users").update(userId, {
          password: newPassword,
          passwordConfirm: newPassword,
        }),
      ).rejects.toThrow(ClientResponseError);
    });

    it("succeeds with the correct oldPassword, and leaves the acting session's own token dead server-side (tokenKey rotation) while still LOCALLY 'valid'", async () => {
      expect(client.authStore.isValid).toBe(true);
      const tokenBeforeChange = client.authStore.token;

      await client.collection("users").update(userId, {
        oldPassword: originalPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      });

      // Real finding, same class of bug `staleSession.ts` documents for a
      // different trigger: `isValid` only checks the JWT's local `exp`
      // claim, so it STAYS true even though the token is now dead
      // server-side (proven right below).
      expect(client.authStore.isValid).toBe(true);

      // Prove the OLD token is actually dead server-side, not just locally
      // stale: a fresh client presenting it is rejected.
      const staleClient = new PocketBase(PB_URL);
      staleClient.authStore.save(tokenBeforeChange, null);
      await expect(
        staleClient.collection("users").getOne(userId),
      ).rejects.toThrow(ClientResponseError);

      // Prove the password change actually took effect: a brand-new login
      // with the NEW password succeeds...
      const freshClient = new PocketBase(PB_URL);
      const auth = await freshClient
        .collection("users")
        .authWithPassword(phone, newPassword);
      expect(auth.record.id).toBe(userId);

      // ...and the OLD password no longer works.
      const rejectedClient = new PocketBase(PB_URL);
      await expect(
        rejectedClient.collection("users").authWithPassword(phone, originalPassword),
      ).rejects.toThrow(ClientResponseError);
    });
  },
);

describe.skipIf(!reachable)(
  "users collection — self profile update semantics (gap-fill, Profile screen)",
  () => {
    it("lets a signed-in user update their own name/phone (updateRule/viewRule are PocketBase's own self-only default, confirmed live)", async () => {
      const testUser = await createTestUser(PB_URL, "8");
      const updated = await testUser.client.collection("users").update(
        testUser.userId,
        { name: "Nombre Actualizado" },
      );
      expect(updated.name).toBe("Nombre Actualizado");
    });

    it("rejects a phone update that collides with another account's phone, as a field-level validation_not_unique error (idx_users_phone)", async () => {
      const userA = await createTestUser(PB_URL, "8a");
      const userB = await createTestUser(PB_URL, "8b");

      const error: unknown = await userB.client
        .collection("users")
        .update(userB.userId, { phone: userA.phone })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ClientResponseError);
      const clientError = error as ClientResponseError;
      expect(clientError.status).toBe(400);
      // The exact shape `src/data/auth.repo.ts#updateOwnProfile`'s docblock
      // and `ProfileScreen`'s error mapping rely on — confirmed live rather
      // than assumed.
      const data = clientError.response.data as {
        phone?: { code?: string };
      };
      expect(data.phone?.code).toBe("validation_not_unique");
    });
  },
);
