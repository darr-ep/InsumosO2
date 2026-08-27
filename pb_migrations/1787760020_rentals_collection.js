/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11 (rentals) + §11.1 (folio) + §13 (API Rules) + §19.1 (server-side
 * status).
 *
 * Phase 1 task 1.1: adds the rentals-specific guards on top of the Phase 0
 * schema-only collection —
 *   - unique index on `folio` (§11.1's safety net against a colliding
 *     MAX+1 read from `pb_hooks/rentals_folio.pb.js`, task 1.2)
 *   - `:isset = false` on `create`/`update` blocking the client from ever
 *     sending `folio`/`status`/`returned_at`/`returned_by`/`created_by`/
 *     `updated_by` in the request body (§13), so those fields can only be
 *     set by the hooks running with internal access.
 *   - explicit `created`/`updated` `autodate` fields (see the customers
 *     migration's docblock for why this isn't automatic on v0.40.1 despite
 *     §11's wording) — `created` is what §11 calls a rental's `started_at`,
 *     and `pb_hooks/rentals_folio.pb.js` (task 1.2) sorts by it to compute
 *     the next folio, so this collection is unusable without it.
 *
 * **API Rule syntax deviation from §13's literal text (confirmed against
 * v0.40.1, not assumed):** the SDD draft used `@request.data.<field>:isset`;
 * the real PocketBase filter parser rejects `@request.data` as an unresolved
 * field and requires `@request.body.<field>:isset` instead (`data` was
 * renamed to `body` in the v0.23 request-rule rewrite). Verified live: the
 * literal §13 syntax fails migration apply with "failed to resolve field
 * ...isset"; `@request.body...` applies cleanly and both the isset guard
 * (malicious create/update with client-set folio/status) and the legit path
 * were exercised end-to-end (task 1.10 evidence).
 */
migrate(
  (app) => {
    const customers = app.findCollectionByNameOrId("customers");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      name: "rentals",
      type: "base",
      fields: [
        {
          name: "folio",
          type: "text",
          required: true,
        },
        {
          name: "customer_id",
          type: "relation",
          required: true,
          collectionId: customers.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: "status",
          type: "select",
          required: true,
          values: ["ACTIVE", "RETURNED"],
          maxSelect: 1,
        },
        {
          name: "returned_at",
          type: "date",
          required: false,
        },
        {
          name: "initial_rent_amount",
          type: "number",
          required: true,
          min: 0,
        },
        {
          name: "deposit_amount",
          type: "number",
          required: false,
          min: 0,
        },
        {
          name: "deposit_returned_amount",
          type: "number",
          required: false,
        },
        {
          name: "extras",
          type: "json",
          required: false,
          maxSize: 1048576,
        },
        {
          name: "created_by",
          type: "relation",
          required: false,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: "updated_by",
          type: "relation",
          required: false,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: "returned_by",
          type: "relation",
          required: false,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_rentals_folio ON rentals (folio)",
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      // §13: the client may never set folio/status/returned_at/returned_by/
      // created_by/updated_by — those are forced server-side by
      // pb_hooks/rentals_folio.pb.js (create) and
      // pb_hooks/rentals_return.pb.js (return, Phase 3).
      //
      // Gap-fill finding 1 (fresh full SDD-vs-codebase audit, post-Login/Auth
      // gap-fill): `deposit_returned_amount` is documented in §11 as
      // server-computed ("se llena al devolver", same category as the
      // fields already guarded above), filled only by
      // `pb_hooks/rentals_return.pb.js` — but it never got the matching
      // `:isset = false` guard on create/update. Confirmed live as a real
      // gap before this fix: any authenticated user could set/overwrite
      // `deposit_returned_amount` directly via
      // `pb.collection('rentals').create/update(...)`, bypassing the return
      // endpoint entirely.
      createRule:
        "@request.auth.id != '' && " +
        "@request.body.folio:isset = false && " +
        "@request.body.status:isset = false && " +
        "@request.body.returned_at:isset = false && " +
        "@request.body.returned_by:isset = false && " +
        "@request.body.created_by:isset = false && " +
        "@request.body.updated_by:isset = false && " +
        "@request.body.deposit_returned_amount:isset = false",
      // Phase 4 task 4.2: `created_by`/`updated_by` are also blocked on
      // Update, not just Create — §13's closing paragraph ("también se
      // bloquean en el body por el mismo motivo, sección 26") and §26's own
      // "nunca se toman del body que manda el cliente" apply to any request
      // the client sends, not only the initial create. Confirmed live as a
      // real gap by task 4.1's audit before this fix: without this guard,
      // any authenticated user could call
      // `pb.collection('rentals').update(id, { updated_by: otherUserId })`
      // and silently overwrite the audit trail with an arbitrary value —
      // `pb_hooks/rentals_return.pb.js` is unaffected (it writes via
      // internal `txApp.save()`, not subject to these API Rules).
      updateRule:
        "@request.auth.id != '' && " +
        "@request.body.status:isset = false && " +
        "@request.body.returned_at:isset = false && " +
        "@request.body.returned_by:isset = false && " +
        "@request.body.folio:isset = false && " +
        "@request.body.created_by:isset = false && " +
        "@request.body.updated_by:isset = false && " +
        "@request.body.deposit_returned_amount:isset = false",
      deleteRule: null,
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("rentals");
    app.delete(collection);
  },
);
