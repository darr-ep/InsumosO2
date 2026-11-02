/// <reference path="../pb_data/types.d.ts" />

/**
 * Migración para eliminar la colección singleton business_settings
 * al dejar de utilizarse "Concentradores disponibles" y "Tanques disponibles".
 */
migrate(
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("business_settings");
      if (collection) {
        app.delete(collection);
      }
    } catch {
      // Si la colección no existe o ya fue eliminada, continuar sin fallar
    }
  },
  (app) => {
    // Reversible: recrear la colección si fuera necesario
    try {
      const collection = new Collection({
        name: "business_settings",
        type: "base",
        fields: [
          {
            name: "total_concentradores",
            type: "number",
            required: false,
            min: 0,
            onlyInt: true,
          },
          {
            name: "total_tanques",
            type: "number",
            required: false,
            min: 0,
            onlyInt: true,
          },
        ],
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: "@request.auth.id != ''",
        deleteRule: null,
      });
      app.save(collection);
    } catch {
      // Ignorar
    }
  },
);
