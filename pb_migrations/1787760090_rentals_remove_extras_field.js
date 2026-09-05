/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("rentals");
    collection.fields.removeByName("extras");
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("rentals");
    collection.fields.add(
      new JSONField({
        name: "extras",
        required: false,
        maxSize: 1048576,
      }),
    );
    app.save(collection);
  },
);
