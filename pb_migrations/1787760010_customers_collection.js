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
 *
 * **Phase 3 fix (real conflict found+confirmed by sdd-verify, blocking
 * Phase 3): `credential_photo` is now `required: false`, not `true`.**
 * §11's own line ("requerido al crear") contradicted §21's failure table
 * ("Falla al subir foto de credencial → se permite continuar y crear la
 * renta igual; el cliente queda marcado 'credencial pendiente'") and Anexo
 * A.5 — with `required: true` at the PocketBase schema level, a client
 * literally cannot submit the `customers` record at all without the file,
 * making A.5's fallback structurally impossible, not just unimplemented.
 * The field stays `type: "file"` and `protected: true` (§15 unchanged) —
 * only the `required` constraint changes. No new status field was added:
 * "credencial pendiente" is derived implicitly from
 * `!customer.credential_photo` (domain/customers/customer.ts —
 * `isCredentialPending`), matching the project's own "sin ERP, sin roles
 * complejos" minimalism (§16.15/§4).
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
          required: false,
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
