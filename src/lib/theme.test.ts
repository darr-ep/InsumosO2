import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveTheme,
  getThemePreference,
  setThemePreference,
  useThemePreference,
} from "@/lib/theme";

const STORAGE_KEY = "insumoso2-theme";

/**
 * `theme.ts` attaches its `matchMedia` "change" listener at most once ever
 * (module-level `mediaListenerAttached` guard, same singleton-listener
 * pattern `useHistoryBackClose.ts` uses) — so this mock is installed once
 * for the whole file rather than per-test, and every test shares the same
 * captured `changeHandler`, whichever hook mount happens to trigger the one
 * real attachment first. `matches` is mutable so tests can flip the
 * simulated OS preference before firing that handler.
 */
const mediaState = { matches: false };
let changeHandler: (() => void) | undefined;

function installStandardMatchMediaMock() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    return {
      get matches() {
        return mediaState.matches;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
}

beforeAll(() => {
  installStandardMatchMediaMock();
});

function fireSystemPreferenceChange(prefersDark: boolean) {
  mediaState.matches = prefersDark;
  act(() => {
    changeHandler?.();
  });
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    mediaState.matches = false;
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    setThemePreference("system");
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to 'system' when nothing is stored", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("resolves 'system' to 'dark' when the OS prefers dark", () => {
    mediaState.matches = true;
    expect(getEffectiveTheme("system")).toBe("dark");
  });

  it("resolves 'system' to 'light' when the OS prefers light", () => {
    mediaState.matches = false;
    expect(getEffectiveTheme("system")).toBe("light");
  });

  it("resolves an explicit preference regardless of OS preference", () => {
    mediaState.matches = true;
    expect(getEffectiveTheme("light")).toBe("light");
  });

  it("persists the preference to localStorage and applies the .dark class", () => {
    setThemePreference("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    setThemePreference("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("useThemePreference reflects the current preference and effective theme, and updates on setThemePreference", () => {
    const { result } = renderHook(() => useThemePreference());

    expect(result.current[0]).toBe("system");

    act(() => {
      result.current[2]("dark");
    });

    expect(result.current[0]).toBe("dark");
    expect(result.current[1]).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("live-updates the effective theme when the OS preference changes while on 'system'", async () => {
    setThemePreference("system");
    const { result } = renderHook(() => useThemePreference());

    fireSystemPreferenceChange(true);

    await waitFor(() => {
      expect(result.current[1]).toBe("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores OS preference changes once an explicit preference is set", () => {
    // Render our own hook first so `changeHandler` is guaranteed populated
    // by THIS test regardless of file order — `theme.ts` attaches its
    // matchMedia listener at most once ever (module-level guard), so a test
    // that only fires the shared `changeHandler` without ever subscribing
    // itself can pass vacuously (as a no-op) if run in isolation/reordered.
    renderHook(() => useThemePreference());

    setThemePreference("light");
    fireSystemPreferenceChange(true);

    expect(getThemePreference()).toBe("light");
    expect(getEffectiveTheme()).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to the legacy addListener/removeListener API when addEventListener is unavailable (Safari/WebKit < 14)", async () => {
    const legacyState = { matches: false };
    let legacyHandler: (() => void) | undefined;
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
      return {
        get matches() {
          return legacyState.matches;
        },
        media: query,
        onchange: null,
        addListener: (handler: () => void) => {
          legacyHandler = handler;
        },
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    });

    vi.resetModules();
    const fresh = await import("@/lib/theme");
    const { result } = renderHook(() => fresh.useThemePreference());

    legacyState.matches = true;
    act(() => {
      legacyHandler?.();
    });

    await waitFor(() => {
      expect(result.current[1]).toBe("dark");
    });
  });

  it("does not crash the app when matchMedia throws on call (e.g. a restricted/sandboxed engine)", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(() => {
      throw new Error("matchMedia not supported on this engine");
    });

    try {
      vi.resetModules();
      const fresh = await import("@/lib/theme");

      // Only asserting the subscription path (what ensureMediaListenerAttached
      // guards) doesn't throw — a throwing matchMedia breaking direct
      // getEffectiveTheme()/systemPrefersDark() calls elsewhere is a separate,
      // pre-existing question outside this fix's scope.
      expect(() => {
        renderHook(() => fresh.useApplyTheme());
      }).not.toThrow();
    } finally {
      // Restore the standard shared mock — this test's throwing mock would
      // otherwise leak into every later test's afterEach (setThemePreference
      // → notify → getEffectiveTheme → systemPrefersDark → matchMedia).
      installStandardMatchMediaMock();
    }
  });

  it("falls back to 'system' for a corrupted/unexpected stored value on fresh module load", async () => {
    localStorage.setItem(STORAGE_KEY, "not-a-real-theme");
    vi.resetModules();
    const fresh = await import("@/lib/theme");
    expect(fresh.getThemePreference()).toBe("system");
  });
});
