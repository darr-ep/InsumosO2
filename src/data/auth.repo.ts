import type { RecordModel } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";

/**
 * SDD.md §14 (Autenticación) + §16.6 — Gap-fill fix (found post-Phase-5, not
 * covered by any original SDD §35 phase task). Thin wrapper over the
 * PocketBase SDK, same pattern as every other `*.repo.ts` file — no
 * business rules here, `LoginScreen` owns the picker/error-message logic.
 */

export interface LoginDirectoryEntry {
  id: string;
  name: string;
  phone: string;
  avatar: string;
}

// Redesign — UX/UI pass: `avatar` is a plain (non `protected`) PocketBase
// file field, servable by a bare URL with no `pb.files.getToken()` (unlike
// `credential_photo`, see `customers.repo.ts#getCredentialPhotoUrl`) — the
// login picker needs this BEFORE the visitor is authenticated, when no
// token could be requested anyway. `collectionName` is hardcoded since
// `login-directory.pb.js` only returns the 4 narrow fields, not the full
// record shape `pb.files.getURL` normally expects.
export function loginDirectoryAvatarUrl(entry: LoginDirectoryEntry): string | null {
  if (!entry.avatar) {
    return null;
  }
  return pb.files.getURL(
    { id: entry.id, collectionName: "users" },
    entry.avatar,
  );
}

/**
 * §14/§16.6: the login picker needs `name` (display) + `phone` (actually
 * used to authenticate) for every business user BEFORE the visitor is
 * authenticated. `users.listRule`/`viewRule` stay self-only on purpose
 * (task 4.2's "narrow, explicit surface" pattern) — this hits the
 * dedicated public route instead (`pb_hooks/login_directory.pb.js`), never
 * the generic `users` collection endpoint.
 *
 * Real bug found live (React StrictMode double-invokes this effect in dev,
 * firing two near-simultaneous GETs to the same URL): the SDK's default
 * auto-cancellation aborts one of the two by request-key collision, and the
 * browser's own HTTP layer can independently race/coalesce the other into a
 * bodyless 304 — either outcome resolves with a non-array value and crashed
 * `LoginScreen`'s `directory.map()`. `requestKey: null` disables SDK
 * auto-cancel for this call (duplicate calls are cheap/idempotent, no need
 * to cancel), so both StrictMode-driven calls resolve independently on
 * their own real HTTP outcome instead of fighting each other.
 */
export async function getLoginDirectory(): Promise<LoginDirectoryEntry[]> {
  return pb.send<LoginDirectoryEntry[]>("/api/login-directory", {
    method: "GET",
    requestKey: null,
  });
}

/**
 * §14: login authenticates directly against `phone` as the identity field,
 * no synthetic email workaround. A successful call persists the session in
 * `pb.authStore` (localStorage-backed, §14's "sesión persistente").
 */
export async function loginWithPassword(
  phone: string,
  password: string,
): Promise<void> {
  await pb.collection("users").authWithPassword(phone, password);
}

/** §14: "logout manual disponible" — clears the persisted session. */
export function logout(): void {
  pb.authStore.clear();
}

/**
 * New gap-fill feature: Self-Service Profile Screen (business owner
 * request, post-Phase-5). The 6 real business accounts are created once by
 * the superuser (§14: "alta de usuarios: manual, por el administrador
 * técnico") and, until now, never touched again unless someone noticed a
 * typo from the admin panel — this closes that gap: any signed-in user can
 * fix their own display name, phone or password without needing
 * admin-panel access. The avatar the superuser assigns at account creation
 * is intentionally permanent — no self-service avatar edit exists by
 * explicit business owner decision.
 *
 * `users.updateRule`/`viewRule` are PocketBase's own UNMODIFIED default
 * (`id = @request.auth.id`, self-only — confirmed live against the local
 * instance, not just trusted from `pb_migrations/1787760000_users_phone_
 * identity.js`'s docblock summary) — a signed-in user can already update
 * their OWN record through the public API with zero migration change
 * needed, the mirror image of `users.createRule = null` (task 4.2).
 */
export interface AuthUserRecord extends RecordModel {
  name: string;
  phone: string;
  avatar: string;
}

/**
 * The signed-in user's own record, straight from the SDK's local
 * `authStore` — no network round-trip. `null` only when nothing is
 * authenticated, which `ProfileScreen` never actually renders under (its
 * route sits behind `RequireAuth`, App.tsx) but is still handled instead of
 * assumed, same defensive shape `useIsAuthenticated` already uses.
 */
export function currentAuthUser(): AuthUserRecord | null {
  return (pb.authStore.record as AuthUserRecord | null) ?? null;
}

// `avatar` is a plain (non `protected`) file field on `users` (confirmed
// live, same as `loginDirectoryAvatarUrl` above already documents for the
// pre-login picker) — a bare `pb.files.getURL()` resolves it with no
// `pb.files.getToken()` round-trip needed, unlike `customers.credential_photo`
// (`customers.repo.ts#getCredentialPhotoUrl`). Takes a real `AuthUserRecord`
// (not the narrow `{id, collectionName}` shape `loginDirectoryAvatarUrl`
// needs) since this is only ever called post-login, when the SDK already
// holds the full record.
export function ownAvatarUrl(user: AuthUserRecord): string | null {
  if (!user.avatar) {
    return null;
  }
  return pb.files.getURL(user, user.avatar);
}

export interface UpdateOwnProfileInput {
  name: string;
  phone: string;
}

/**
 * `phone` carries a UNIQUE index (`idx_users_phone`) — a duplicate phone is
 * rejected by PocketBase as a 400 with a field-level `validation_not_unique`
 * error on `response.data.phone` (confirmed live), which `ProfileScreen`
 * maps to a friendly inline message instead of the generic save-failure
 * copy.
 */
export async function updateOwnProfile(
  input: UpdateOwnProfileInput,
): Promise<AuthUserRecord> {
  const user = currentAuthUser();
  if (!user) {
    throw new Error("No hay una sesión activa.");
  }
  return pb.collection("users").update<AuthUserRecord>(user.id, input);
}

export interface ChangeOwnPasswordInput {
  oldPassword: string;
  password: string;
  passwordConfirm: string;
}

/**
 * Live-verified (`src/data/auth-profile.integration.test.ts`): a
 * non-superuser session changing its OWN password must send the correct
 * `oldPassword` alongside `password`/`passwordConfirm` — omitted or wrong,
 * PocketBase rejects with a 400. On success, PocketBase rotates the
 * record's `tokenKey` server-side, which immediately kills every
 * previously-issued token for that user, INCLUDING the one this very
 * request just used — even though `pb.authStore.isValid` keeps reporting
 * `true` right after (it only checks the JWT's local `exp` claim, never
 * round-trips to the server; same class of bug `staleSession.ts` already
 * documents for a different trigger, found live 2026-08-27).
 *
 * Re-authenticating transparently via `loginWithPassword` immediately after
 * a successful change closes that gap here rather than letting it surface
 * later as a confusing generic "Tu sesión expiró" redirect on some
 * unrelated next action — chosen as the less jarring option for 6
 * non-technical business users (see this function's own integration test
 * file for the full live-verified story).
 */
export async function changeOwnPassword(
  input: ChangeOwnPasswordInput,
): Promise<void> {
  const user = currentAuthUser();
  if (!user) {
    throw new Error("No hay una sesión activa.");
  }

  await pb.collection("users").update(user.id, input);
  await loginWithPassword(user.phone, input.password);
}
