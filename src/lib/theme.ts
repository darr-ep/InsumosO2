import { useEffect, useSyncExternalStore } from "react";

/**
 * App-wide dark-mode preference. Module-level singleton (same pattern as
 * `useHistoryBackClose.ts`'s `openStack`) rather than a React Context — there
 * is exactly one document to toggle `.dark` on, so a Context provider would
 * just be indirection around a value every consumer already shares globally.
 *
 * `index.html` runs an inline, synchronous script (before this module or any
 * React code loads) that mirrors `readStoredPreference`/`systemPrefersDark`
 * below in plain JS and sets `.dark` on `<html>` pre-paint, so there's no
 * flash of the wrong theme on load. This module takes over from there for
 * every subsequent change (toggle click, live OS preference change while on
 * "system").
 */
export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

const STORAGE_KEY = "insumoso2-theme";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Storage unavailable (private browsing, etc.) — fall through to default.
  }
  return "system";
}

// Read lazily (not captured as a module-scope constant) so tests can mock
// `window.matchMedia` before any of this module's functions run, without
// needing `vi.resetModules()` to force re-evaluation of a cached reference.
function getMediaQueryList(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
}

function systemPrefersDark(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

let preference: ThemePreference = readStoredPreference();
const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  return preference;
}

export function getEffectiveTheme(pref: ThemePreference = preference): EffectiveTheme {
  return pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;
}

function applyToDocument(): void {
  document.documentElement.classList.toggle("dark", getEffectiveTheme() === "dark");
}

function notify(): void {
  applyToDocument();
  for (const listener of listeners) {
    listener();
  }
}

// Legacy MediaQueryList shape (Safari/WebKit < 14, still found on older
// shop-floor tablets) — no addEventListener/removeEventListener, only the
// deprecated addListener/removeListener pair.
interface LegacyMediaQueryList {
  addListener(listener: () => void): void;
}

function hasLegacyAddListener(
  media: MediaQueryList,
): media is MediaQueryList & LegacyMediaQueryList {
  return typeof (media as unknown as LegacyMediaQueryList).addListener === "function";
}

// Attached once, lazily, on first subscription — kept registered for the
// document's whole lifetime rather than added/removed per preference change.
// It only acts while `preference === "system"`, so picking an explicit
// light/dark preference makes it a no-op without needing to detach it; a
// single always-on listener is simpler than churning `addEventListener`
// calls for identical behavior.
//
// Real gap found in review: neither the addEventListener/addListener feature
// check nor a surrounding try/catch existed here originally. `useApplyTheme`
// runs unconditionally at the app root (including the unauthenticated
// `/login` route), so an uncaught throw here — e.g. on Safari/WebKit < 14,
// which only exposes the deprecated `addListener` — was caught by the
// top-level ErrorBoundary and replaced the ENTIRE app with the generic error
// screen, on every mount, with no in-app recovery (both "Reintentar" and
// "Recargar página" just remount and re-throw). A failure to live-update on
// OS preference changes is a fully acceptable degradation; crashing the app
// over it is not.
let mediaListenerAttached = false;
function ensureMediaListenerAttached(): void {
  if (mediaListenerAttached) {
    return;
  }
  try {
    const media = getMediaQueryList();
    if (!media) {
      return;
    }
    const handleChange = () => {
      if (preference === "system") {
        notify();
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
    } else if (hasLegacyAddListener(media)) {
      media.addListener(handleChange);
    } else {
      return;
    }
    mediaListenerAttached = true;
  } catch {
    // Degrade to "system preference changes won't live-update until next
    // reload" rather than letting this take down the whole app.
  }
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage unavailable — preference still applies for this session.
  }
  notify();
}

export function subscribeTheme(listener: () => void): () => void {
  ensureMediaListenerAttached();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reactive read + setter for the toggle UI (`AppHeader`'s theme menu).
 * Returns both the raw preference (for showing which of the 3 options is
 * checked) and the effective light/dark mode (for the icon glyph, which
 * reflects what's actually on screen right now, not literally "system").
 */
export function useThemePreference(): [ThemePreference, EffectiveTheme, (next: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribeTheme, getThemePreference, getThemePreference);
  const effective = useSyncExternalStore(
    subscribeTheme,
    () => getEffectiveTheme(pref),
    () => getEffectiveTheme(pref),
  );
  return [pref, effective, setThemePreference];
}

/**
 * Mounted once at the app root (`App.tsx`) so the OS-preference listener
 * stays alive for the whole session regardless of which screen is showing
 * (e.g. the unauthenticated `/login` route, which has no `AppHeader` toggle
 * to otherwise trigger the subscription) — see this module's own docblock.
 */
export function useApplyTheme(): void {
  useEffect(() => subscribeTheme(() => {}), []);
}
