import { useEffect, useRef } from "react";

/**
 * Makes the Android/browser back gesture (and the hardware back button)
 * close the topmost open `Dialog`/`Sheet` instead of falling through to the
 * router/PWA history — neither Radix `Dialog` nor Vaul `Drawer` push a
 * history entry on their own, so without this a back-gesture while a modal
 * is open navigates the underlying screen away (or exits the app) instead.
 *
 * Shared by `ui/dialog.tsx` and `ui/sheet.tsx` rather than patched per call
 * site: every open modal pushes ONE dummy history entry and registers
 * itself on a module-level stack; a single `popstate` (back gesture) only
 * ever closes the entry at the TOP of that stack, so nested popups
 * (`ConfirmDialog` rendered as a JSX sibling of an already-open
 * `PaymentDialog`/`ReturnDialog`, per this codebase's established nesting
 * pattern) close one at a time, innermost first — a back-gesture never
 * skips straight past a stacked confirm to the screen underneath.
 *
 * When a modal closes NORMALLY (a button tap, not the back gesture), its
 * cleanup calls `history.back()` itself to consume the entry it pushed —
 * otherwise the history stack would grow by one every time a modal opens
 * and closes, and a LATER unrelated back-gesture would just re-open it.
 * That self-triggered `history.back()` fires its own `popstate`, which
 * would otherwise be indistinguishable from a real user gesture and could
 * wrongly close whatever the NEXT dialog down the stack is — a shared
 * counter (`popstatesToSuppress`) marks exactly that many upcoming
 * `popstate` events as self-inflicted so the stack-top handler skips them.
 *
 * Real regression caught by `App.test.tsx`'s stale-session redirect test:
 * a route-level `<Navigate replace>` (e.g. `RequireAuth` reacting to a
 * session expiring while a `LoadingDialog` happened to be open) REPLACES
 * the current history entry — which may be the very entry this hook
 * pushed. Blindly calling `history.back()` on close would then undo that
 * real navigation instead of just discarding a stale placeholder entry. So
 * the URL is recorded at push time, and the self-cleanup `history.back()`
 * only runs if the URL is UNCHANGED at close time — if something else
 * navigated (push OR replace) while this modal was open, its own entry has
 * already been superseded and there is nothing to consume.
 *
 * That URL check has to happen AFTER any sibling effect from the SAME
 * commit has had a chance to run its own history change, not synchronously
 * inside this cleanup — when a modal unmounts because its whole ancestor
 * subtree is being replaced (the stale-session case above: `RequireAuth`
 * conditionally swaps its authenticated `<Outlet>` subtree for
 * `<Navigate replace>` in one commit), React runs the OLD subtree's
 * cleanups (this hook's included) before the NEWLY rendered `<Navigate>`'s
 * own effect fires the `replaceState` call — so checking the URL
 * synchronously here would still see the pre-navigation URL and wrongly
 * conclude nothing happened yet. Deferring the check by one macrotask lets
 * that sibling navigation land first.
 */

const openStack: Array<() => void> = [];
let popstatesToSuppress = 0;
let listenerAttached = false;

function handlePopState() {
  if (popstatesToSuppress > 0) {
    popstatesToSuppress--;
    return;
  }
  const top = openStack[openStack.length - 1];
  top?.();
}

function ensureListenerAttached() {
  if (!listenerAttached) {
    window.addEventListener("popstate", handlePopState);
    listenerAttached = true;
  }
}

export function useHistoryBackClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    ensureListenerAttached();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.history.pushState({ __insumosO2ModalDepth: openStack.length + 1 }, "");
    const urlAtOpen = window.location.href;

    let closedViaPopstate = false;
    const closeFn = () => {
      closedViaPopstate = true;
      onCloseRef.current();
    };
    openStack.push(closeFn);

    return () => {
      const index = openStack.lastIndexOf(closeFn);
      if (index !== -1) {
        openStack.splice(index, 1);
      }
      setTimeout(() => {
        if (!closedViaPopstate && window.location.href === urlAtOpen) {
          popstatesToSuppress++;
          window.history.back();
        }
      }, 0);
    };
  }, [open]);
}
