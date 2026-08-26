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

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.passwordAuth.identityFields = ["email"];
    users.removeIndex("idx_users_phone");
    users.fields.removeByName("phone");

    app.save(users);
  },
);
