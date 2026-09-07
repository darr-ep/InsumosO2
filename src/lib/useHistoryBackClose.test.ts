import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryBackClose } from "@/lib/useHistoryBackClose";

function firePopState() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

// The hook's self-cleanup `history.back()` call is deferred by one
// macrotask (see the hook's own docblock for why) — flush it with a real
// timer the same way this codebase's other async-UI tests do (e.g.
// AccountMenu.test.tsx's real 600ms pause), rather than reaching for fake
// timers.
async function flushDeferredCleanup() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/**
 * Root-cause context (live-QA bug, phone screenshots): neither Radix
 * `Dialog` nor Vaul `Drawer` push a history entry on open, so an
 * Android/browser back gesture fell through to the router/PWA history
 * instead of closing the topmost modal. This hook (wired into
 * `ui/dialog.tsx`'s `Dialog` and `ui/sheet.tsx`'s `Sheet`) fixes that at the
 * shared primitive.
 *
 * Every test below explicitly rerenders back to `open: false` (or leaves
 * the hook genuinely still-open only when that's the exact thing under
 * test) instead of relying on `@testing-library/react`'s automatic
 * unmount-on-afterEach cleanup — that automatic cleanup fires as an
 * OUTER `afterEach` and runs AFTER this file's own inner `afterEach`
 * (which restores the `history.back()` mock below), so an un-rerendered,
 * still-mounted hook would run its close-time `history.back()` call
 * against the REAL implementation instead of the mock, leaking a
 * permanently-incremented `popstatesToSuppress` into whichever test runs
 * next. Closing deterministically inside each test sidesteps that
 * ordering entirely.
 */
describe("useHistoryBackClose", () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pushStateSpy = vi.spyOn(window.history, "pushState");
    // A real `history.back()` asynchronously fires exactly one `popstate` —
    // the hook's `popstatesToSuppress` counter relies on that to swallow
    // its OWN self-triggered back-navigation (see the hook's docblock). A
    // plain no-op mock would leave that counter permanently incremented,
    // so mimic the real browser's side effect here instead of stubbing it
    // away entirely.
    backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
  });

  it("pushes a history entry when it opens, and consumes it via history.back() when closed normally", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ open }) => useHistoryBackClose(open, onClose),
      { initialProps: { open: false } },
    );
    rerender({ open: true });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(backSpy).not.toHaveBeenCalled();

    rerender({ open: false });
    await flushDeferredCleanup();

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not push a history entry while closed", () => {
    const onClose = vi.fn();
    renderHook(() => useHistoryBackClose(false, onClose));

    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("calls onClose when a popstate (back gesture) fires while open, and does not double-consume history on the caller's resulting close", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ open }) => useHistoryBackClose(open, onClose),
      { initialProps: { open: false } },
    );
    rerender({ open: true });

    firePopState();

    expect(onClose).toHaveBeenCalledTimes(1);

    // The caller reacts to onClose by flipping its own `open` state to
    // false — simulate that next render. This must NOT call history.back()
    // again (the entry was already consumed by the back gesture itself),
    // which would otherwise send the user back an extra step.
    backSpy.mockClear();
    rerender({ open: false });
    await flushDeferredCleanup();

    expect(backSpy).not.toHaveBeenCalled();
  });

  it("with two nested opens (e.g. ConfirmDialog on top of an already-open PaymentDialog), a single back gesture closes only the topmost one", () => {
    const onCloseOuter = vi.fn();
    const onCloseInner = vi.fn();

    const outer = renderHook(
      ({ open }) => useHistoryBackClose(open, onCloseOuter),
      { initialProps: { open: false } },
    );
    outer.rerender({ open: true });

    const inner = renderHook(
      ({ open }) => useHistoryBackClose(open, onCloseInner),
      { initialProps: { open: false } },
    );
    inner.rerender({ open: true });

    firePopState();

    expect(onCloseInner).toHaveBeenCalledTimes(1);
    expect(onCloseOuter).not.toHaveBeenCalled();

    // Inner reacts to its own onClose by closing (as above, no extra
    // history.back()); a second back gesture now reaches the outer one.
    inner.rerender({ open: false });
    firePopState();

    expect(onCloseOuter).toHaveBeenCalledTimes(1);

    outer.rerender({ open: false });
  });
});
