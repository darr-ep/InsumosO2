/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11 (rental_items) + §13 (Base API Rules, Phase 0 task 0.10).
 *
 * Explicit `created`/`updated` autodate fields added in Phase 1 (see
 * `1787760010_customers_collection.js`'s docblock — not automatic on
 * v0.40.1 base collections despite §11's wording).
 */
migrate(
  (app) => {
    const rentals = app.findCollectionByNameOrId("rentals");

    const collection = new Collection({
      name: "rental_items",
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
          name: "item_type",
          type: "select",
          required: true,
          values: ["concentrator", "tank"],
          maxSelect: 1,
        },
        {
          name: "quantity",
          type: "number",
          required: true,
          min: 1,
          onlyInt: true,
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
    const collection = app.findCollectionByNameOrId("rental_items");
    app.delete(collection);
  },
);
