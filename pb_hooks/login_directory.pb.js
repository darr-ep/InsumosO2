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
 * Returns ONLY `[{id, name, phone}]` for every `users` record — nothing
 * else (no `email`, `avatar`, `verified`, `created`, etc.). No
 * `$apis.requireAuth()` middleware: this route must work with zero users
 * authenticated, since its entire purpose is powering the picker a visitor
 * sees BEFORE logging in.
 */
routerAdd("GET", "/api/login-directory", (e) => {
  const users = e.app.findAllRecords("users");

  const directory = users.map((user) => ({
    id: user.id,
    name: user.get("name"),
    phone: user.get("phone"),
  }));

  return e.json(200, directory);
});
