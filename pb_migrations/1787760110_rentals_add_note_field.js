/// <reference path="../pb_data/types.d.ts" />

/**
 * Agrega el campo opcional `note` a la colección `rentals`
 * para registrar notas de devolución u observaciones.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("rentals");
    collection.fields.add(
      new TextField({
        name: "note",
        required: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("rentals");
    collection.fields.removeByName("note");
    app.save(collection);
  },
);
