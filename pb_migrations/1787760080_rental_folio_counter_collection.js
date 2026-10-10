/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §11.1 (folio consecutivo). Backs the atomic-counter fix in
 * `pb_hooks/rentals_folio.pb.js` — replaces the previous "read the most
 * recently created rental, parse its folio, +1" approach.
 *
 * That approach was confirmed live (task: post-launch bug report) to be
 * both racy under concurrent creates AND simply WRONG whenever two rentals
 * share a `created` timestamp (autodate ties sort non-deterministically —
 * `sort: "-created", limit 1` can return an older record than the true
 * highest folio; every retry then recomputes the same already-taken number
 * forever, exhausting the retry budget and surfacing a raw "Value must be
 * unique." to the user even on a single, non-concurrent create).
 *
 * A single-row counter, incremented inside `app.runInTransaction` (which
 * serializes concurrent writers to the same row at the SQLite level), is
 * immune to both failure modes — no read-then-insert window, no dependence
 * on `created` ordering at all.
 *
 * Never exposed to the client: every rule is `null`, so only internal
 * `app`/`txApp` access from `pb_hooks/rentals_folio.pb.js` (and this
 * migration's own seed step) ever touches this collection.
 */
migrate(
  (app) => {
    const collection = new Collection({
      name: "rental_folio_counter",
      type: "base",
      fields: [
        { name: "value", type: "number", required: false, min: 0, onlyInt: true },
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(collection);

    // Seed from the TRUE max folio already in `rentals` (a raw SQL
    // aggregate over the numeric suffix, not just the most-recently-created
    // row) so this picks up exactly where existing data left off —
    // including any pre-existing wider-padded folios from an earlier
    // format (e.g. "R-000001").
    const result = new DynamicModel({ maxNumber: 0 });
    app
      .db()
      .newQuery(
        "SELECT COALESCE(MAX(CAST(SUBSTR(folio, 3) AS INTEGER)), 0) AS maxNumber FROM rentals",
      )
      .one(result);

    const counter = new Record(collection, { value: result.maxNumber });
    app.save(counter);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("rental_folio_counter");
    app.delete(collection);
  },
);
