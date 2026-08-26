/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11 (payments) + §11.2 (`payment_type`) + §13 (Base API Rules,
 * Phase 0 task 0.10).
 *
 * `note` requiredness for `payment_type = 'adjustment'` is a conditional
 * rule the plain PocketBase schema can't express — that validation lives in
 * `pb_hooks/payments_validate.pb.js`, explicitly Phase 2 task 2.2 (§20).
 * `amount` can be negative only for adjustments (§11.2); PocketBase's
 * `min` field validator can't express that conditional either, so `amount`
 * is left unconstrained at the schema level and enforced client-side (Zod,
 * §20) plus, if ever needed, in the same Phase 2 hook.
 *
 * Explicit `created`/`updated` autodate fields added in Phase 1 (see
 * `1787760010_customers_collection.js`'s docblock — not automatic on
 * v0.40.1 base collections despite §11's wording). `created` is what §11
 * calls a payment's `paid_at`.
 */
migrate(
  (app) => {
    const rentals = app.findCollectionByNameOrId("rentals");
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      name: "payments",
      type: "base",
      fields: [
        {
          name: "rental_id",
          type: "relation",
          required: true,
          collectionId: rentals.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: "amount",
          type: "number",
          required: true,
        },
        {
          name: "payment_type",
          type: "select",
          required: true,
          values: ["rent", "deposit", "adjustment"],
          maxSelect: 1,
        },
        {
          name: "note",
          type: "text",
          required: false,
        },
        {
          name: "created_by",
          type: "relation",
          required: false,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
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
    const collection = app.findCollectionByNameOrId("payments");
    app.delete(collection);
  },
);
