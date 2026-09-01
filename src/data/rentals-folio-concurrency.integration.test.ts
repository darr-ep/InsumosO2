// @vitest-environment node
//
// Same reasoning as rentals.integration.test.ts: real network I/O against a
// live PocketBase, exercising the actual server-side hook, not a mock.
import { describe, expect, it } from "vitest";
import { createTestUser } from "@/data/testSupport";

/**
 * SDD.md §30 ("Tests de los hooks: folio consecutivo bajo creación
 * concurrente") + §11.1 (folio consecutivo — generación server-side).
 *
 * Gap-fill finding 2: §30's testing strategy explicitly calls for a test
 * of folio uniqueness under concurrent creation, and none existed anywhere
 * in the suite. `pb_hooks/rentals_folio.pb.js` computes the next folio by
 * sorting `-created` and taking the top record (a known, accepted, already
 * documented minor divergence from a true MAX() aggregate — NOT changed by
 * this test, only exercised). §11.1 explains why this pattern is safe on
 * SQLite (PocketBase's embedded engine serializes writes, even under WAL)
 * and that the unique index on `folio` remains a safety net regardless.
 *
 * **Real behavior confirmed live, worth documenting precisely**: firing
 * genuinely concurrent creates against a real running instance DOES
 * produce real `validation_not_unique` rejections on `folio` for a
 * fraction of requests (2/8 in the run that produced this test) — the
 * "read max, then insert" pattern is not atomic across separate requests,
 * so two concurrent requests can legitimately compute the same candidate
 * folio before either commits. This is exactly the outcome §11.1 already
 * documents as acceptable ("si por cualquier motivo dos creaciones
 * llegaran a colisionar, la segunda falla con un error claro en vez de
 * guardar un folio duplicado silenciosamente") — the unique index is the
 * safety net, and it is doing its job: it converts a would-be silent
 * duplicate into an explicit, typed validation error the client can
 * retry. This test proves that guarantee, not zero-contention concurrency
 * (which the hook was never designed to provide, per the SDD's own
 * wording) — it fires several concurrent creates and asserts (1) every
 * request that DOES succeed gets a unique folio (never a silent
 * duplicate), (2) every request that fails does so specifically because
 * of a `folio` uniqueness collision (never a different, unrelated
 * error), and (3) the successful folios form a contiguous sequence.
 */

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090";
const CONCURRENT_CREATES = 8;

async function isPocketBaseReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${PB_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

const reachable = await isPocketBaseReachable();

describe.skipIf(!reachable)(
  "rentals folio — consecutive under concurrent creation, live PocketBase (§30/§11.1, gap-fill finding 2)",
  () => {
    it(`resolves ${CONCURRENT_CREATES} concurrent creates into unique folios, with any collision explicitly rejected (never silently duplicated)`, async () => {
      const testUser = await createTestUser(PB_URL, "7");
      const pb = testUser.client;
      // Real gotcha found live: the PocketBase JS SDK auto-cancels
      // "duplicate" pending requests to the same collection endpoint by
      // default (auto-cancellation) — firing several concurrent
      // `rentals.create()` calls on one client got every request but the
      // last aborted with `ClientResponseError 0 (aborted)` before it ever
      // reached the server, which would have silently defeated this very
      // test's purpose (it must prove REAL server-side concurrency safety,
      // not measure the SDK's own request deduplication). Disabling it here
      // is scoped to this one client/test.
      pb.autoCancellation(false);

      const uniqueSuffix = Date.now().toString().slice(-9);
      const customer = await pb.collection("customers").create({
        name: "Cliente de prueba (folio concurrency)",
        phone: `9${uniqueSuffix}`.slice(0, 10),
      });

      const creates = Array.from({ length: CONCURRENT_CREATES }, () =>
        pb.collection("rentals").create({
          customer_id: customer.id,
          initial_rent_amount: 100,
        }),
      );

      const results = await Promise.allSettled(creates);
      expect(results).toHaveLength(CONCURRENT_CREATES);

      const fulfilled = results.filter(
        (result) => result.status === "fulfilled",
      );
      const rejected = results.filter((result) => result.status === "rejected");

      // At least one request must actually succeed — a non-trivial result,
      // not "everything failed".
      expect(fulfilled.length).toBeGreaterThan(0);

      const folios = fulfilled.map((result) => result.value.folio);

      // Every successful folio matches the expected format.
      for (const folio of folios) {
        expect(folio).toMatch(/^R-\d{3,}$/);
      }

      // No silent duplicates: the Set has exactly as many entries as
      // requests that actually succeeded.
      const uniqueFolios = new Set(folios);
      expect(uniqueFolios.size).toBe(fulfilled.length);

      // Successful folios form a contiguous sequence — no request silently
      // skipped or double-claimed a number.
      const numbers = folios
        .map((folio) => parseInt(folio.slice(2), 10))
        .sort((a, b) => a - b);
      for (let i = 1; i < numbers.length; i += 1) {
        expect(numbers[i]).toBe(numbers[i - 1] + 1);
      }

      // Any rejection must be EXACTLY the documented §11.1 safety net
      // (a folio uniqueness collision), never a different/unrelated error —
      // proves the unique index, not something else, is what's catching it.
      for (const failure of rejected) {
        const reason = (failure as PromiseRejectedResult).reason as {
          response?: { data?: { folio?: { code?: string } } };
        };
        expect(reason.response?.data?.folio?.code).toBe(
          "validation_not_unique",
        );
      }
    });
  },
);
