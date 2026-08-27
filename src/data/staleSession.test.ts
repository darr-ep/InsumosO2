import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientResponseError } from "pocketbase";

const clear = vi.fn();

vi.mock("@/data/pocketbaseClient", () => ({
  pb: {
    authStore: {
      clear: (...args: unknown[]) => clear(...args),
    },
  },
}));

const {
  isStaleSessionError,
  handleIfStaleSession,
  consumeSessionMessage,
  STALE_SESSION_MESSAGE,
} = await import("@/data/staleSession");

/**
 * §14 gap-fill (live bug, 2026-08-27): PocketBase rotates a user's
 * `tokenKey` on password change, invalidating any previously-issued JWT
 * even though its own `exp` claim hasn't expired — `pb.authStore.isValid`
 * (useIsAuthenticated.ts) never round-trips to the server to catch this.
 * This module is the single place that decides "is this error actually a
 * stale/invalidated session" so every write's catch block doesn't have to
 * duplicate that judgment call 4+ times.
 */
describe("staleSession (§14 gap-fill)", () => {
  beforeEach(() => {
    clear.mockReset();
    // Drain any pending message left over by a prior test in this file.
    consumeSessionMessage();
  });

  describe("isStaleSessionError", () => {
    it("treats a plain 401 as a stale session", () => {
      const error = new ClientResponseError({
        status: 401,
        response: { message: "The request requires valid record authorization token." },
      });

      expect(isStaleSessionError(error)).toBe(true);
    });

    it("treats a 400 with a PocketBase generic rule-failure message and no field errors as a stale session", () => {
      const error = new ClientResponseError({
        status: 400,
        response: { message: "Failed to create record.", data: {} },
      });

      expect(isStaleSessionError(error)).toBe(true);
    });

    it("does NOT treat a 400 field-validation error as a stale session (real validation failure)", () => {
      const error = new ClientResponseError({
        status: 400,
        response: {
          message: "Failed to create record.",
          data: {
            name: { code: "validation_required", message: "Cannot be blank." },
          },
        },
      });

      expect(isStaleSessionError(error)).toBe(false);
    });

    it("does NOT treat this app's own hook-thrown business error as a stale session (payment race guard)", () => {
      const error = new ClientResponseError({
        status: 400,
        response: {
          message: "No se puede registrar un pago: la renta ya fue devuelta.",
          data: {},
        },
      });

      expect(isStaleSessionError(error)).toBe(false);
    });

    it("does NOT treat a network failure (status 0) as a stale session", () => {
      const error = new ClientResponseError({
        status: 0,
        response: {},
        isAbort: false,
      });

      expect(isStaleSessionError(error)).toBe(false);
    });

    it("does NOT treat a 429 rate-limit error as a stale session", () => {
      const error = new ClientResponseError({ status: 429, response: {} });

      expect(isStaleSessionError(error)).toBe(false);
    });

    it("does NOT treat a plain (non-PocketBase) Error as a stale session", () => {
      expect(isStaleSessionError(new Error("network down"))).toBe(false);
    });
  });

  describe("handleIfStaleSession", () => {
    it("clears the session and queues the plain-Spanish message when the error is a stale session", () => {
      const error = new ClientResponseError({ status: 401, response: {} });

      const handled = handleIfStaleSession(error);

      expect(handled).toBe(true);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
      expect(STALE_SESSION_MESSAGE).toBe("Tu sesión expiró. Vuelve a entrar.");
    });

    it("does nothing and returns false for a normal validation/network error", () => {
      const handled = handleIfStaleSession(new Error("network down"));

      expect(handled).toBe(false);
      expect(clear).not.toHaveBeenCalled();
      expect(consumeSessionMessage()).toBeNull();
    });

    it("does nothing and returns false for this app's own business-rule rejection", () => {
      const error = new ClientResponseError({
        status: 400,
        response: {
          message: "Esta renta ya fue devuelta.",
          data: {},
        },
      });

      const handled = handleIfStaleSession(error);

      expect(handled).toBe(false);
      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe("consumeSessionMessage", () => {
    it("returns null when nothing is pending", () => {
      expect(consumeSessionMessage()).toBeNull();
    });

    it("returns the message exactly once, then null on the next call", () => {
      handleIfStaleSession(new ClientResponseError({ status: 401, response: {} }));

      expect(consumeSessionMessage()).toBe(STALE_SESSION_MESSAGE);
      expect(consumeSessionMessage()).toBeNull();
    });
  });
});
