import { AlertTriangle, Check, CircleHelp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * design-fidelity (Slice B1, obs #2221/#2224/#2223) — shared confirmation
 * popup reused across every state-mutating/work-discarding action the
 * confirm-dialogs audit (#2221) flagged. Built on `ui/dialog.tsx`, no new
 * dependency (`@radix-ui/react-alert-dialog` explicitly rejected).
 *
 * Visual mapping to frame `d41cks` (330x235): no close (X) button so the
 * only exits are the two buttons; centered rose circle + red
 * `AlertTriangle`; centered bold title + gray description; side-by-side
 * full-width buttons with Cancelar = outline, confirm = default/black
 * unless `tone="destructive"` is explicitly requested (none of this
 * change's 8 call sites use it, per the design's deliberate black
 * "Sí, devolver").
 *
 * Initial focus on Cancel is achieved by DOM ORDER, not an
 * `onOpenAutoFocus` override: with `showCloseButton={false}`, the Cancel
 * button is the first focusable descendant of `DialogContent`, so Radix's
 * default autofocus behavior lands there. Load-bearing but implicit —
 * pinned by `ConfirmDialog.test.tsx` so a future markup reorder (e.g.
 * moving confirm before cancel) can't silently move initial focus onto the
 * (sometimes destructive) confirm button.
 *
 * Nesting pattern (design B3): callers render this as a JSX SIBLING of
 * their parent `Dialog`/`Sheet`, never inside its `DialogContent` — see
 * `overlayClassName="bg-scrim/60 backdrop-blur-none"` below, which exists
 * specifically so two stacked Radix overlays don't compound to near-black.
 *
 * Scoped correction (RESILIENCE-001, frozen findings ledger obs #2230):
 * `disabled={isConfirming}` on the two buttons only gates their own
 * `onClick` — Radix's Escape/outside-click dismiss on `DialogContent` is
 * independent of that. Without the three handlers below, a user could
 * dismiss the popup mid-mutation (Escape or clicking outside) while the
 * underlying, irreversible `createPayment`/`returnRental` call kept running
 * and completed anyway. `preventDefault()` on all three while
 * `isConfirming` is true keeps the popup open and the mutation the only way
 * out until it actually resolves.
 *
 * 3-state redesign (pencil ground truth: "Alerta" / "Alerta · Cargando" /
 * "Alerta · Éxito" frames) — `status` is a new, additive, optional prop.
 * Omitting it (or passing `"idle"`) renders byte-identical markup to the
 * original single-state component, so every existing call site keeps
 * working with zero changes. Only a caller that opts into the full
 * confirm→loading→success sequence (currently just the Cerrar sesión flow
 * in `AccountMenu.tsx` — the one real case with no separate downstream
 * summary screen) needs to pass `status` plus the `loading*`/`success*`
 * copy. The Payment/Return "Carga · Procesando…" loading toasts use a
 * different, progress-bar-based pattern and are deliberately out of scope
 * here.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  tone?: "default" | "destructive" | "info";
  showCancel?: boolean;
  isConfirming?: boolean;
  status?: "idle" | "loading" | "success";
  loadingTitle?: string;
  loadingDescription?: string;
  successTitle?: string;
  successDescription?: string;
  successLabel?: string;
  onDismissSuccess?: () => void;
  // Forwarded to the underlying `Dialog` — see its own `manageHistory` doc.
  // Only a `useBlocker`-driven caller (RentalNewScreen's exit guard) needs
  // to pass `false`; every other call site keeps the default.
  manageHistory?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  tone = "default",
  showCancel = true,
  isConfirming = false,
  status = "idle",
  loadingTitle,
  loadingDescription,
  successTitle,
  successDescription,
  successLabel = "Listo",
  onDismissSuccess,
  manageHistory = true,
}: ConfirmDialogProps) {
  const isBlocked = isConfirming || status !== "idle";
  const isLoading = status === "loading";
  const isSuccess = status === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} manageHistory={manageHistory}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[360px] sm:max-w-[380px] w-full"
        overlayClassName="bg-scrim/60 backdrop-blur-none"
        onEscapeKeyDown={(event) => {
          if (isBlocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBlocked) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBlocked) event.preventDefault();
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {isSuccess ? (
            // `key` forces a remount on every entry into this state so the
            // one-shot `animate-icon-pop` entrance replays each time
            // (a className alone wouldn't re-trigger on a prop change).
            <div
              key="success"
              className="animate-icon-pop flex size-12 items-center justify-center rounded-full bg-success-soft"
            >
              <Check aria-hidden="true" className="size-6 text-success" />
            </div>
          ) : isLoading ? (
            <div
              key="loading"
              className="animate-icon-in flex size-12 items-center justify-center rounded-full bg-primary-soft"
            >
              <Loader2
                aria-hidden="true"
                className="text-primary size-6 animate-spin"
              />
            </div>
          ) : tone === "info" ? (
            <div
              key="info"
              className="flex size-12 items-center justify-center rounded-full bg-primary-soft"
            >
              <CircleHelp
                aria-hidden="true"
                className="size-6 text-primary"
              />
            </div>
          ) : (
            <div
              key="idle"
              className="flex size-12 items-center justify-center rounded-full bg-destructive-soft"
            >
              <AlertTriangle
                aria-hidden="true"
                className="size-6 text-destructive"
              />
            </div>
          )}
          <DialogTitle className="text-center">
            {isSuccess
              ? (successTitle ?? title)
              : isLoading
                ? (loadingTitle ?? title)
                : title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isSuccess
              ? (successDescription ?? description)
              : isLoading
                ? (loadingDescription ?? description)
                : description}
          </DialogDescription>
        </div>

        {isSuccess ? (
          <DialogFooter>
            <Button
              type="button"
              size="lg"
              // Dark-mode audit: a literal near-black button would nearly
              // vanish against the dark theme's own near-black --card/
              // --background — inverted to near-white in dark mode, same
              // "deliberately neutral, not brand-blue" intent per theme.
              className="w-full whitespace-normal text-sm px-4 py-2 h-auto min-h-11 leading-tight text-center bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              onClick={onDismissSuccess ?? (() => onOpenChange(false))}
            >
              <Check aria-hidden="true" />
              {successLabel}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className={showCancel ? "flex-row gap-2" : "flex-col"}>
            {showCancel && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1 whitespace-normal text-xs sm:text-sm px-2.5 py-2 h-auto min-h-11 leading-tight text-center break-words"
                disabled={isBlocked}
                onClick={() => onOpenChange(false)}
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              type="button"
              variant={tone === "destructive" ? "destructive" : "default"}
              size="lg"
              className={
                tone === "destructive"
                  ? (showCancel ? "flex-1 whitespace-normal text-xs sm:text-sm px-2.5 py-2 h-auto min-h-11 leading-tight text-center break-words" : "w-full whitespace-normal text-sm px-4 py-2 h-auto min-h-11 leading-tight text-center")
                  : (showCancel
                      ? "flex-1 whitespace-normal text-xs sm:text-sm px-2.5 py-2 h-auto min-h-11 leading-tight text-center break-words bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                      : "w-full whitespace-normal text-sm px-4 py-2 h-auto min-h-11 leading-tight text-center bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300")
              }
              disabled={isBlocked}
              onClick={() => void onConfirm()}
            >
              {isLoading ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Procesando...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
