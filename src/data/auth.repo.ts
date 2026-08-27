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
}

/**
 * §14/§16.6: the login picker needs `name` (display) + `phone` (actually
 * used to authenticate) for every business user BEFORE the visitor is
 * authenticated. `users.listRule`/`viewRule` stay self-only on purpose
 * (task 4.2's "narrow, explicit surface" pattern) — this hits the
 * dedicated public route instead (`pb_hooks/login_directory.pb.js`), never
 * the generic `users` collection endpoint.
 */
export async function getLoginDirectory(): Promise<LoginDirectoryEntry[]> {
  return pb.send<LoginDirectoryEntry[]>("/api/login-directory", {
    method: "GET",
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
