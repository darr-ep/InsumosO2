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
