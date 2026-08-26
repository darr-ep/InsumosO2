/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11 (rentals) + §13 (Base API Rules, Phase 0 task 0.10).
 *
 * Phase 0 scope only (per sdd/mvp/tasks): the collection's full §11 field
 * set exists, with the *generic* auth-only API rule pattern from §13's
 * first code block. The rentals-specific guards — unique index on `folio`
 * and the `:isset = false` rules blocking client-set `folio`/`status`/
 * `returned_at`/`returned_by`/`created_by`/`updated_by` — are explicitly
 * Phase 1 task 1.1, done together with the folio-generation hook (task 1.2)
 * that those guards exist to protect. Until Phase 1 lands, nothing enforces
 * `status`/`folio` server-side yet — this collection is schema-only
 * scaffolding, not yet safe to write real rental data against.
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
    const collection = app.findCollectionByNameOrId("rentals");
    app.delete(collection);
  },
);
