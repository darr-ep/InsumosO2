/// <reference path="../pb_data/types.d.ts" />

/**
 * Permite que los usuarios de negocio autenticados puedan eliminar
 * registros de clientes, rentas, productos de renta y pagos.
 */
migrate(
  (app) => {
    const customers = app.findCollectionByNameOrId("customers");
    customers.deleteRule = "@request.auth.id != ''";
    app.save(customers);

    const rentals = app.findCollectionByNameOrId("rentals");
    rentals.deleteRule = "@request.auth.id != ''";
    app.save(rentals);

    const rentalItems = app.findCollectionByNameOrId("rental_items");
    rentalItems.deleteRule = "@request.auth.id != ''";
    app.save(rentalItems);

    const payments = app.findCollectionByNameOrId("payments");
    payments.deleteRule = "@request.auth.id != ''";
    app.save(payments);
  },
  (app) => {
    const customers = app.findCollectionByNameOrId("customers");
    customers.deleteRule = null;
    app.save(customers);

    const rentals = app.findCollectionByNameOrId("rentals");
    rentals.deleteRule = null;
    app.save(rentals);

    const rentalItems = app.findCollectionByNameOrId("rental_items");
    rentalItems.deleteRule = null;
    app.save(rentalItems);

    const payments = app.findCollectionByNameOrId("payments");
    payments.deleteRule = null;
    app.save(payments);
  }
);
