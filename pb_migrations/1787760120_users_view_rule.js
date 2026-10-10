/// <reference path="../pb_data/types.d.ts" />

/**
 * Multi-Account Audit Names: Allow authenticated users to view/list user profiles.
 *
 * PocketBase auth collections default to `id = @request.auth.id` (self-only) for
 * both `listRule` and `viewRule`. When user B views records created or modified by
 * user A (e.g., expanding `created_by`, `returned_by`, or `updated_by` on rentals
 * and payments), PocketBase's relation expand fails to resolve user A's record unless
 * `listRule`/`viewRule` permit authenticated users (`@request.auth.id != ""`) to read
 * user profile names.
 *
 * This migration updates `users.listRule` and `users.viewRule` to `@request.auth.id != ""`
 * so that audit names are properly visible across all authenticated staff accounts.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.listRule = "id = @request.auth.id";
    users.viewRule = "id = @request.auth.id";

    app.save(users);
  },
);
