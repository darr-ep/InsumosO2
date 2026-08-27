import PocketBase from "pocketbase";

/**
 * SDD.md §14 (Autenticación) — Phase 4 task 4.2 fix. `users.createRule` is
 * now `null` (admin-panel-only account creation, closing the public
 * self-registration gap `src/data/auth-registration.integration.test.ts`
 * documents/proves). Live integration tests still need throwaway users to
 * authenticate as "a business user performing this action" — the same
 * operational privilege every one of the app's 6 real accounts has (§14's
 * own "todo usuario autenticado tiene los mismos permisos operativos").
 *
 * PocketBase superuser sessions bypass collection API Rules entirely — the
 * same mechanism the admin panel itself relies on — so this helper
 * authenticates as a superuser first and uses THAT session to create the
 * throwaway test user, never the (now closed) public create endpoint.
 *
 * Requires a superuser to already exist on the target instance
 * (`./pocketbase.exe superuser upsert <email> <password>`, documented in
 * `pb_migrations/README.md`). Configurable via env vars so a real/CI
 * instance isn't forced to share this file's defaults, which only exist so
 * a fresh local scratch instance works without extra setup.
 *
 * **Superuser session is cached per PocketBase URL, not re-authenticated on
 * every call.** Real gap found while implementing task 4.3 (native rate
 * limiting, `pb_migrations/1787760050_rate_limiting_settings.js`): each
 * live-integration test file's `beforeEach` legitimately creates several
 * throwaway users, and a fresh superuser login per call multiplied real
 * `*:auth`-labeled requests enough to trip the rate limiter mid-suite even
 * with a generous budget — this was confirmed live (the suite failed with
 * 429s) before this caching fix. Reusing one superuser session across all
 * `createTestUser` calls in a given file cuts that volume roughly in half
 * without weakening the rate limit itself.
 */

const SUPERUSER_EMAIL =
  import.meta.env.VITE_PB_TEST_SUPERUSER_EMAIL ??
  "phase4-test-superuser@insumoso2.local";
const SUPERUSER_PASSWORD =
  import.meta.env.VITE_PB_TEST_SUPERUSER_PASSWORD ?? "Passw0rd!2026Super";

const superuserClientsByUrl = new Map<string, PocketBase>();

/**
 * Exported (Gap-fill fix, §14) so a live-integration test that needs a raw
 * superuser session — e.g. proving `users.email` is optional by creating a
 * record with no email field at all — doesn't have to duplicate the
 * cached-session/credential logic above.
 */
export async function getSuperuserClient(pbUrl: string): Promise<PocketBase> {
  const cached = superuserClientsByUrl.get(pbUrl);
  if (cached?.authStore.isValid) {
    return cached;
  }

  const client = new PocketBase(pbUrl);
  await client
    .collection("_superusers")
    .authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
  superuserClientsByUrl.set(pbUrl, client);
  return client;
}

export interface TestUserHandle {
  /** Authenticated as the newly created regular (non-superuser) user. */
  client: PocketBase;
  userId: string;
}

/**
 * Creates a throwaway `users` record via a (cached) superuser session
 * (bypasses `createRule`), then authenticates a fresh client as that user
 * via the normal `phone`+`password` login (§14) — exactly how the real app
 * logs in, so tests still exercise the real authenticated-session path.
 */
export async function createTestUser(
  pbUrl: string,
  prefix: string,
): Promise<TestUserHandle> {
  const superuserClient = await getSuperuserClient(pbUrl);

  const uniqueSuffix =
    Date.now().toString().slice(-8) +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
  const phone = `${prefix}${uniqueSuffix}`.slice(0, 10);
  const email = `${prefix}-${uniqueSuffix}@insumoso2.local`;
  const password = "Passw0rd!2026";

  await superuserClient.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    phone,
    name: `Integration Test User ${prefix}`,
  });
  // Note: the superuser session is intentionally NOT cleared here — it's
  // cached and reused across calls (see getSuperuserClient above), which is
  // exactly why this session no longer needs re-authenticating per call.

  const client = new PocketBase(pbUrl);
  const auth = await client
    .collection("users")
    .authWithPassword(phone, password);

  return { client, userId: auth.record.id };
}
