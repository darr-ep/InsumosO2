import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let isValidState = false;
let changeListener: (() => void) | null = null;
const unsubscribe = vi.fn();

vi.mock("@/data/pocketbaseClient", () => ({
  pb: {
    authStore: {
      get isValid() {
        return isValidState;
      },
      onChange: (callback: () => void) => {
        changeListener = callback;
        return unsubscribe;
      },
    },
  },
}));

const { useIsAuthenticated } = await import("@/app/useIsAuthenticated");

/**
 * Gap-fill fix (§14, App.tsx had zero auth check before this): both the
 * route guard and the `/login` redirect-if-authenticated behavior need to
 * react LIVE to `pb.authStore` changes (login/logout), not just on mount.
 */
describe("useIsAuthenticated (§14, gap-fill)", () => {
  beforeEach(() => {
    isValidState = false;
    changeListener = null;
    unsubscribe.mockReset();
  });

  it("reflects pb.authStore.isValid at mount time", () => {
    isValidState = true;

    const { result } = renderHook(() => useIsAuthenticated());

    expect(result.current).toBe(true);
  });

  it("returns false when there is no valid session", () => {
    const { result } = renderHook(() => useIsAuthenticated());

    expect(result.current).toBe(false);
  });

  it("reacts live to an authStore change (e.g. login or logout) without remounting", () => {
    const { result } = renderHook(() => useIsAuthenticated());

    expect(result.current).toBe(false);

    isValidState = true;
    act(() => {
      changeListener?.();
    });

    expect(result.current).toBe(true);
  });

  it("unsubscribes from authStore changes on unmount", () => {
    const { unmount } = renderHook(() => useIsAuthenticated());

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
