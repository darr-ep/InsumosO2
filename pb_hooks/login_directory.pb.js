/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §14 (Autenticación) + §16.6 (login = selector de usuario +
 * contraseña) — Gap-fill fix (found post-Phase-5, not covered by any
 * original SDD §35 phase task).
 *
 * `GET /api/login-directory` — a small, deliberately narrow, PUBLIC
 * (unauthenticated) custom route. The login screen needs to show every
 * business user's `name` (to pick) and `phone` (to actually call
 * `authWithPassword(phone, password)`) BEFORE the visitor is
 * authenticated, but `users.listRule`/`viewRule` are self-only
 * (`id = @request.auth.id`, PocketBase's own default) — an anonymous
 * visitor cannot list other users through the generic collection endpoint,
 * and widening that rule was explicitly rejected: it would also expose
 * `avatar`/`verified`/`email`/etc. more broadly than needed and diverges
 * from Phase 4's own established "narrow, explicit surface" pattern (same
 * reasoning as `rentals_folio.pb.js`/`rentals_return.pb.js` using a custom
 * route instead of loosening a collection's generic API Rules).
 *
 * Returns `[{id, name, phone, avatar}]` for every `users` record — still
 * nothing else (no `email`, `verified`, `created`, etc.). No
 * `$apis.requireAuth()` middleware: this route must work with zero users
 * authenticated, since its entire purpose is powering the picker a visitor
 * sees BEFORE logging in.
 *
 * **Correction (Redesign — UX/UI pass, login picker avatars):** `avatar`
 * used to be deliberately excluded from this response, lumped in with
 * `email`/`verified` as "more than the narrow surface needs". That
 * reasoning doesn't hold for `avatar` specifically once the login picker
 * actually needs to show one per user (business-owner request) — a profile
 * photo is no more sensitive than the `name`/`phone` this route already
 * exposes publicly, and PocketBase's `avatar` field is a plain (non
 * `protected`) file, servable by a bare URL with no token — same class of
 * exposure, not a wider one. `email`/`verified` stay excluded; only
 * `avatar` is added.
 */
routerAdd("GET", "/api/login-directory", (e) => {
  const users = e.app.findAllRecords("users");

  const directory = users.map((user) => ({
    id: user.id,
    name: user.get("name"),
    phone: user.get("phone"),
    avatar: user.get("avatar"),
  }));

  // Real bug found live: without this, the browser's HTTP cache can
  // negotiate a bodyless 304 for one of two near-simultaneous GETs (React
  // StrictMode double-invokes LoginScreen's fetch effect in dev), which
  // resolved as a non-array value and crashed `directory.map()` client-side.
  // This route's data can also change at any time (a business user added),
  // so it should never be cached anyway.
  e.response.header().set("Cache-Control", "no-store");

  return e.json(200, directory);
});
