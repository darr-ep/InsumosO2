import { ClientResponseError } from "pocketbase";
import { pb } from "@/data/pocketbaseClient";

/**
 * SDD.md §14 gap-fill (live bug found 2026-08-27, while user-testing on a
 * real device): PocketBase rotates a user's `tokenKey` on password change,
 * which invalidates any JWT issued before that rotation even though the
 * token's own `exp` claim hasn't expired yet. `pb.authStore.isValid`
 * (useIsAuthenticated.ts) only checks that local `exp` claim — it never
 * round-trips to the server — so the app kept showing a "logged in" UI
 * (Dashboard, logout button, etc.) while every real request was silently
 * treated as unauthenticated server-side. Confirmed live via PocketBase's
 * own `_logs` table: read requests returned empty results with a 200
 * (`listRule`/`viewRule` just filter rows, no hard gate, so an
 * unauthenticated read looks like "no results" instead of an error), while
 * write requests hit the `createRule` gate and failed with an internal
 * `"create rule failure: sql: no rows in result set"` error — a
 * server-log-only detail; its exact wording is never trusted client-side.
 *
 * This module is the single place that decides "is this error actually a
 * stale/invalidated session" — every write's catch block calls
 * `handleIfStaleSession` instead of duplicating that judgment call 4+
 * times across CustomerForm/CustomerPicker, RentalNewScreen, PaymentDialog
 * and ReturnDialog.
 *
 * Detection is deliberately conservative — it must never swallow a real
 * domain error (e.g. this project's own hook-thrown `BadRequestError`s,
 * like "No se puede registrar un pago: la renta ya fue devuelta." from
 * `pb_hooks/payments_validate.pb.js`, or a real field-validation failure):
 * - status 401 is always treated as a stale/invalid session (some
 *   PocketBase auth checks surface a rotated `tokenKey` as a plain 401
 *   instead of falling through to the createRule/updateRule check).
 * - status 400 counts ONLY when BOTH: (a) it has no field-level validation
 *   errors (`response.data` populated per-field is how PocketBase reports
 *   a real schema-validation failure, e.g. a required field missing), AND
 *   (b) its `message` is one of PocketBase's own fixed generic
 *   record-operation failure strings (from the Go `apis` package, stable
 *   across versions — this is what a bare `createRule`/`updateRule` denial
 *   produces, with no field detail to report). Every hook in this codebase
 *   throws `BadRequestError` with its own specific Spanish message instead
 *   (see `pb_hooks/payments_validate.pb.js`, `pb_hooks/rentals_return.pb.js`),
 *   which never matches one of these fixed strings — so a real
 *   business-rule rejection always still shows its own message, never gets
 *   redirected to `/login`.
 */
const POCKETBASE_GENERIC_RULE_FAILURE_MESSAGES = new Set<string>([
  "Failed to create record.",
  "Failed to update record.",
  "Failed to delete record.",
  "Failed to authenticate.",
  "You are not allowed to perform this request.",
]);

function hasFieldValidationErrors(error: ClientResponseError): boolean {
  const data = error.response?.data as Record<string, unknown> | undefined;
  return !!data && Object.keys(data).length > 0;
}

/**
 * True when `error` represents a session that is no longer valid
 * server-side, even though `pb.authStore.isValid` may still say otherwise.
 */
export function isStaleSessionError(
  error: unknown,
): error is ClientResponseError {
  if (!(error instanceof ClientResponseError)) {
    return false;
  }

  if (error.status === 401) {
    return true;
  }

  if (error.status !== 400) {
    return false;
  }

  if (hasFieldValidationErrors(error)) {
    return false;
  }

  return POCKETBASE_GENERIC_RULE_FAILURE_MESSAGES.has(error.message);
}

/** Plain-Spanish microcopy, §16.14's tone — shown once on `/login`. */
export const STALE_SESSION_MESSAGE = "Tu sesión expiró. Vuelve a entrar.";

let pendingSessionMessage: string | null = null;

/**
 * `LoginScreen` calls this once on mount to read (and clear) the pending
 * "why did I land here" message, if any.
 */
export function consumeSessionMessage(): string | null {
  const message = pendingSessionMessage;
  pendingSessionMessage = null;
  return message;
}

/**
 * Call from a write's catch block BEFORE falling back to its own generic
 * failure message. Returns `true` when `error` was a stale-session error:
 * the local session is cleared here, which fires `pb.authStore.onChange`
 * and lets `RequireAuth` (App.tsx) redirect to `/login` on its own — no
 * `navigate()` call needed from the caller, which should just `return`
 * without setting its own domain-specific error state. Returns `false` for
 * every other error (network failure, validation error, rate limiting,
 * this app's own business-rule rejections), so callers keep their existing
 * behavior completely unchanged.
 */
export function handleIfStaleSession(error: unknown): boolean {
  if (!isStaleSessionError(error)) {
    return false;
  }

  pendingSessionMessage = STALE_SESSION_MESSAGE;
  pb.authStore.clear();
  return true;
}
