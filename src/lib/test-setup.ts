import "@testing-library/jest-dom/vitest";

// Mock pointer capture methods for jsdom environment (used by pointer event handlers like Vaul)
if (typeof Element !== "undefined") {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// jsdom doesn't implement `matchMedia` at all — `embla-carousel` (the
// Inicio/Clientes swipe, `AppLayout.tsx`) calls it unconditionally during
// setup (to support its own `breakpoints` option, unused here) and throws
// without this, in every test that renders `AppLayout`.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

// jsdom has no `IntersectionObserver` either — `embla-carousel` uses one
// internally (its `SlidesInView` component) regardless of whether the
// consumer reads that particular piece of its API.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
    takeRecords = () => [];
  }
  window.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

// Same reason, same fix, for `ResizeObserver` (`embla-carousel`'s
// `ResizeHandler` component).
if (typeof window !== "undefined" && !window.ResizeObserver) {
  class MockResizeObserver implements ResizeObserver {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  }
  window.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
}

