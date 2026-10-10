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
 *
 * Real bug found live: when `VITE_POCKETBASE_URL` is empty (the LAN/Tailscale
 * dev setup, where Vite proxies `/api` to PocketBase so both origins are the
 * same), the SDK's own empty-baseURL fallback resolves against
 * `window.location.pathname`, not just the origin — so a request made while
 * on `/login` becomes `/login/api/...` instead of `/api/...`, missing Vite's
 * proxy match and silently getting the SPA-fallback `index.html` back
 * instead of JSON. Falling back to `window.location.origin` (no path)
 * ourselves sidesteps that SDK behavior entirely and is correct regardless
 * of which route is active.
 */
export const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || window.location.origin,
);

// Prevent PocketBase SDK from cancelling concurrent requests to the same collection/path
pb.autoCancellation(false);

