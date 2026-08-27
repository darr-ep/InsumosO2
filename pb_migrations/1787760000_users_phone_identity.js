/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §14 — Autenticación.
 *
 * PocketBase already ships a default "users" auth collection out of the box
 * (id `_pb_users_auth_`), which is why Phase 0's task list treats "users"
 * as one of the collections to configure rather than create from scratch
 * (§11 already documents it as "colección de auth nativa de PocketBase").
 *
 * This migration adds the one thing the default collection doesn't have:
 * `phone`, used directly as the PocketBase auth identity field so the login
 * UI can call `pb.collection('users').authWithPassword(phone, password)`
 * without a synthetic email workaround (§14). `name` already exists by
 * default on a fresh PocketBase install and is reused as-is for the login
 * selector's display name.
 *
 * **Phase 4 task 4.2 fix (real gap found+confirmed live by that task's API
 * Rules audit): `createRule` is now `null` (admin-panel-only), not the
 * PocketBase default.** §14 says explicitly: "Alta de usuarios: manual, por
 * el administrador técnico, desde el panel admin de PocketBase
 * (superusuario). No hay pantalla de auto-registro en la PWA." The PWA
 * itself never renders a registration screen, but PocketBase's default
 * `users` collection ships with a public (open) `createRule` — confirmed
 * live via a raw anonymous `POST /api/collections/users/records`, which
 * succeeded and created a real account before this fix. Since §14 also
 * says "todo usuario autenticado tiene los mismos permisos operativos" and
 * §13 gates every business collection on `@request.auth.id != ""` alone,
 * an open `createRule` on `users` meant anyone who found the API URL could
 * self-register and immediately gain full read/write access to every
 * customer/rental/payment record — the same class of "client-controlled
 * field the API must never trust" problem §13/§26 solve elsewhere, applied
 * to account creation itself. `deleteRule: null` already existed by
 * default (only a superuser can delete a user) — `createRule` now matches
 * that same "solo el administrador técnico desde el panel admin" pattern
 * used everywhere else in this project (§13). `list`/`view`/`update` were
 * confirmed live (still) as PocketBase's own defaults
 * (`id = @request.auth.id`, self-only) — no change needed there, no gap
 * found. Login (`authWithPassword`) is unaffected: `createRule` only gates
 * the record-create endpoint, and superuser sessions bypass all collection
 * API Rules unconditionally (the same mechanism the admin panel itself
 * uses), which is how `src/data/testSupport.ts` creates throwaway test
 * users for the live integration test suite now that public
 * self-registration is closed.
 *
 * **Gap-fill fix (found post-Phase-5, explicit user request): `email` is
 * now `required: false`.** `createRule = null` means every one of the
 * business's 6 real accounts gets created manually by the superuser from
 * the PocketBase admin panel (§14: "Alta de usuarios: manual, por el
 * administrador técnico") — a step the business does not need to invent a
 * throwaway email address for every time. `email` stays in
 * `passwordAuth.identityFields` alongside `phone` (harmless, unused by the
 * app — login only ever calls `authWithPassword(phone, password)`) so
 * PocketBase's own account-recovery/admin tooling still has an identity
 * field to fall back to if an email IS provided, without forcing one.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.add(
      new TextField({
        name: "phone",
        required: true,
        presentable: true,
      }),
    );

    users.addIndex(
      "idx_users_phone",
      true,
      "phone",
      "",
    );

    // Login identifies by `phone` (§14); keep `email` too since PocketBase's
    // own account-recovery/admin tooling still expects an identity field to
    // exist and the schema already requires `email` as a system field.
    users.passwordAuth.identityFields = ["email", "phone"];

    // Phase 4 task 4.2: close public self-registration (see docblock above).
    users.createRule = null;

    // Gap-fill fix: stop forcing the superuser to invent an email for each
    // of the 6 manually-created accounts (see docblock above).
    const emailField = users.fields.getByName("email");
    emailField.required = false;

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const emailField = users.fields.getByName("email");
    emailField.required = true;

    users.createRule = "";
    users.passwordAuth.identityFields = ["email"];
    users.removeIndex("idx_users_phone");
    users.fields.removeByName("phone");

    app.save(users);
  },
);
