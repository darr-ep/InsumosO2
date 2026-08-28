/// <reference path="../pb_data/types.d.ts" />

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced). `total_concentradores`/`total_tanques`
 * used to be two build-time env vars (`VITE_TOTAL_CONCENTRADORES`/
 * `VITE_TOTAL_TANQUES`, Redesign Round 2 Batch 4) — editing them required a
 * `.env` file edit + a dev-server restart, which the business owner can't
 * do herself. This collection moves those two numbers into durable,
 * app-editable PocketBase storage, both to increase (buys more equipment)
 * and decrease (a unit breaks/is retired). Explicitly NOT an inventory
 * module: no per-unit tracking, no catalog, no purchase history — just two
 * numbers.
 *
 * `business_settings` is a SINGLETON collection by design: exactly ONE row
 * exists, ever, seeded by this migration. `createRule`/`deleteRule` are
 * `null` (superuser/admin-panel-only), same reasoning
 * `1787760000_users_phone_identity.js` (task 4.2) already established for
 * `users.createRule` — an open create/delete rule would let any
 * authenticated client spawn a second row (which `getBusinessSettings`'s
 * `getFirstListItem("")` would then silently pick an arbitrary one of) or
 * delete the only row, leaving the Dashboard's availability tiles with
 * nothing to read. `listRule`/`viewRule`/`updateRule` follow §13's generic
 * authenticated-user pattern — every one of the business's 6 users has
 * equal operational permissions (§14) and needs to both see and edit these
 * two numbers directly from the Dashboard tiles (no separate settings
 * screen, business owner's explicit "sin configuración adicional"
 * preference, same minimalism as everything else in this redesign).
 *
 * Seeded with `total_concentradores: 0, total_tanques: 0` — the same
 * documented default `.env.example` used for the now-removed
 * `VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES` (0 is a real, valid
 * "nothing configured yet" state, not an error — same precedent
 * `domain/rentals/availability.ts`'s removed `DEFAULT_TOTAL_STOCK` constant
 * already established before this migration took over that role).
 *
 * **Real finding, confirmed live against this PocketBase v0.40.1 instance
 * (not assumed): both fields are `required: false`, NOT `true`.** A
 * `NumberField` with `required: true` rejects `0` as "cannot be blank" —
 * confirmed live via this migration's own seed step failing to apply
 * ("total_concentradores: cannot be blank; total_tanques: cannot be blank")
 * when both were first tried as `required: true` with the seed value `0`.
 * PocketBase's "required" check treats a number field's zero value as
 * empty, same as an unset string — it does not distinguish "explicitly set
 * to 0" from "never set". Since 0 must be an accepted, real value here (the
 * whole point of this migration, see above), `required: true` is simply
 * the wrong constraint for this field — `min: 0` + `onlyInt: true` already
 * provide the real server-side guard (rejects negative/non-integer values
 * sent directly via the API), matching `rentals_collection.js`'s
 * `deposit_amount` field (`required: false, min: 0`), not its
 * `initial_rent_amount` field (`required: true, min: 0` — never actually
 * exercised with a 0 value in this codebase, so that same gotcha never
 * surfaced there).
 */
migrate(
  (app) => {
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
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      // Singleton collection: nobody (not even an authenticated client)
      // should ever create a second row or delete the only one — see this
      // file's own docblock above.
      createRule: null,
      deleteRule: null,
    });

    app.save(collection);

    const record = new Record(collection, {
      total_concentradores: 0,
      total_tanques: 0,
    });
    app.save(record);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("business_settings");
    app.delete(collection);
  },
);
