/// <reference path="../pb_data/types.d.ts" />

/**
 * SDD.md §25 (Seguridad — rate limiting). Phase 4 task 4.3.
 *
 * **Real finding, confirmed live against this PocketBase v0.40.1 instance's
 * own Settings API (`GET /api/settings`, superuser-only), not assumed: §25's
 * literal premise — "PocketBase no trae rate limiting granular por endpoint
 * incorporado — se configura en la capa de reverse proxy" — is WRONG for
 * this version.** PocketBase v0.40.1 ships a native, per-label rate limiter
 * (`app.settings().rateLimits`), disabled by default, with sensible
 * out-of-the-box rules already defined:
 *   - `*:auth`     2 requests / 3s   (login/auth-with-password attempts)
 *   - `*:create`  20 requests / 5s   (any collection create)
 *   - `/api/batch` 3 requests / 1s
 *   - `/api/`    300 requests / 10s  (general API fallback)
 *
 * This migration flips `enabled = true` and keeps PocketBase's own shipped
 * defaults for `*:create`/`/api/batch`/`/api/` (none of those ever caused a
 * problem in this task's live verification). `*:auth` is retuned to
 * `10 requests / 30s` in production — still meaningfully tighter than a
 * brute-force script needs to be slowed down by (hundreds/thousands of
 * guesses per second reduced to ~20/minute), while giving a small business's
 * 6 real users (§14, all with equal permissions) reasonable headroom for a
 * mistyped password or several people logging in around the same time.
 * This satisfies §25's real goal ("mitigar fuerza bruta sobre el login y
 * abuso de la API pública") at the application layer, without depending on
 * `nginx-proxy-manager`/the VPS (task 0.8, still deferred) at all. See
 * `pb_migrations/README.md` for the complementary (still-pending,
 * VPS-dependent) reverse-proxy layer §25 originally called for.
 *
 * **`PB_TEST_MODE` env var — test-only escape hatch, real gap found and
 * fixed while implementing this task:** enabling even a generously-tuned
 * `*:auth` limit by default broke this repo's own live-integration test
 * suite — every test file's `beforeEach`/`beforeAll` (`src/data/
 * testSupport.ts`) legitimately authenticates several throwaway users per
 * file to exercise real authenticated-session behavior, and the FULL suite
 * accumulates several dozen real auth requests within well under a minute.
 * No single production-appropriate `*:auth` budget survived that (`2/3s`,
 * `20/10s`, and `40/30s` were all tried live and all still 429'd legitimate
 * suite traffic even after `testSupport.ts`'s own superuser-session-caching
 * fix). Rather than permanently loosen the PRODUCTION rate limit to the
 * point it stops being meaningfully protective just to satisfy local test
 * concurrency, this migration reads `PB_TEST_MODE` (`$os.getenv`, confirmed
 * present in this PocketBase version's JSVM bindings) and uses a much
 * larger `*:auth` budget (`1000 requests / 60s` — effectively unlimited for
 * a 6-user app, but the rate limiter itself stays structurally "on" rather
 * than fully disabled, so `rateLimits.enabled` behavior is still exercised)
 * ONLY when that env var is set. Every scratch instance this project's live
 * integration suite runs against MUST set `PB_TEST_MODE=1` before `serve`
 * (documented in `pb_migrations/README.md`) — the ACTUAL rate-limiting
 * behavior itself is still verified for real by
 * `src/data/rate-limiting.integration.test.ts` against a SEPARATE scratch
 * instance that intentionally does NOT set `PB_TEST_MODE`, proving the
 * production configuration genuinely works without that test-only override
 * ever masking it.
 *
 * **Important production caveat, NOT resolved by this migration (requires
 * the real VPS/nginx-proxy-manager topology from deferred task 0.8/4.7,
 * not guessable now):** PocketBase's rate limiter buckets by client IP.
 * Once traffic goes through `nginx-proxy-manager` as a reverse proxy, EVERY
 * request will appear to originate from the proxy's own IP unless
 * `app.settings().trustedProxy` is explicitly configured to trust the real
 * client IP from the proxy's forwarded-for header — otherwise, in
 * production, one user's activity could rate-limit ALL 6 users off a
 * single shared bucket (the exact same failure mode this migration's own
 * `PB_TEST_MODE` section above describes for the local test suite, but for
 * real users). Configuring `trustedProxy` correctly requires knowing the
 * actual nginx-proxy-manager network topology (its real IP/subnet on the
 * VPS), which does not exist yet — must be set as part of task 0.8/4.7's
 * real deployment, not guessed here.
 *
 * Confirmed live: `src/data/rate-limiting.integration.test.ts` fires
 * repeated login attempts against a `PB_TEST_MODE`-unset scratch instance
 * and asserts a 429 appears once the production `*:auth` bucket is
 * exhausted — failed (no 429 ever returned) before this migration, passes
 * after. Confirmed live (separately) that this repo's full live-integration
 * test suite passes cleanly against a `PB_TEST_MODE=1` instance, and that
 * it did NOT pass against any production-tuned `*:auth` budget tried,
 * `PB_TEST_MODE` unset — see `pb_migrations/README.md` for the exact
 * before/after run evidence.
 */
migrate(
  (app) => {
    const settings = app.settings();
    const isTestMode = !!$os.getenv("PB_TEST_MODE");

    settings.rateLimits.enabled = true;
    settings.rateLimits.rules = [
      {
        label: "*:auth",
        audience: "",
        duration: isTestMode ? 60 : 30,
        maxRequests: isTestMode ? 1000 : 10,
      },
      { label: "*:create", audience: "", duration: 5, maxRequests: 20 },
      { label: "/api/batch", audience: "", duration: 1, maxRequests: 3 },
      { label: "/api/", audience: "", duration: 10, maxRequests: 300 },
    ];

    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    app.save(settings);
  },
);
