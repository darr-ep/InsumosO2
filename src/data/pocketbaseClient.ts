import PocketBase from "pocketbase";

/**
 * SDD.md §8 (arquitectura — el frontend habla directo con PocketBase) + §14
 * (sesión persistente vía el `authStore` del SDK) + §29 (variable de
 * entorno).
 *
 * Single shared client instance for the whole app: PocketBase's SDK already
 * persists the auth token in `localStorage` via its default `authStore`
 * implementation, which is what makes "sesión persistente (PWA instalada,
 * no se pide login constantemente)" (§14) work with zero extra code here.
 *
 * No admin/superuser auth ever happens from this client (§29): every
 * request goes through as the signed-in business user, gated by the API
 * Rules (§13) and the pb_hooks/ (§11.1, §19.1) — same principle as before,
 * just no "anon key" concept the way Supabase had one.
 */
export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);
