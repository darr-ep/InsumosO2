/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11 (customers) + §13 (Base API Rules, Phase 0 task 0.10).
 *
 * §13's generic pattern applies as-is to `customers`: any authenticated
 * business user can list/view/create/update, nobody can delete via the
 * public API (delete rule left empty — only the admin panel superuser can).
 *
 * `credential_photo` is `protected` per §15 — never publicly resolvable by
 * URL alone, only via a short-lived `pb.files.getToken()` token.
 *
 * **Deviation found during Phase 1 task 1.1/1.2 runtime harness (fixed
 * here):** §11's "PocketBase gives every collection `created`/`updated`
 * automatically" does not hold for JS-migration `new Collection()` base
 * collections on v0.40.1 — unlike the built-in `_superusers`/`users` system
 * collections (which declare explicit `autodate` fields), a base collection
 * with no `created`/`updated` entries in its `fields` array simply has no
 * such fields; they don't error, they just don't exist. Confirmed live:
 * `GET customers/records` returned records with no `created` key at all.
 * Both fields are now declared explicitly, matching how the built-in
 * `users` auth collection actually does it.
 */
migrate(
  (app) => {
    const collection = new Collection({
      name: "customers",
      type: "base",
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
        },
        {
          name: "phone",
          type: "text",
          required: true,
        },
        {
          name: "credential_photo",
          type: "file",
          required: true,
          protected: true,
          maxSelect: 1,
          maxSize: 8388608, // 8MB, matches the client-side Zod limit (§20)
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: null,
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("customers");
    app.delete(collection);
  },
);
