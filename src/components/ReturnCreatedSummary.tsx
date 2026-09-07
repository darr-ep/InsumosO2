import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReturnReceiptData } from "@/domain/rentals/receipt";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { isAutoPrintEnabled } from "@/printing/printSettings";
import { useReceiptActions } from "@/printing/useReceiptActions";

/**
 * Redesign Round 3, punto 5 (devolución): mantiene el flujo existente
 * (Detalle → Devolver → confirmación → renta devuelta) pero, tras devolver,
 * muestra una confirmación breve en vez del comprobante completo.
 *
 * Normalized to match `RentalCreatedSummary`'s exact pattern (post-launch
 * polish — the two "just did X" confirmations had drifted: this one had no
 * inline print/share at all, only a "Ver comprobante" hop into the full
 * `ReceiptDialog`). Now reuses `useReceiptActions` directly — same
 * Imprimir(`secondary`)/Compartir(`outline`) actions, same print-status
 * messages, no "Ver comprobante" (this dialog already shows every field
 * inline — a separate step to see the receipt again is redundant).
 * "Volver al inicio" is the one `variant="default"` (primary) button, kept
 * LAST in DOM order for the same reason `RentalCreatedSummary` keeps
 * "Continuar" last: `DialogFooter`'s `flex-col items-stretch` keeps DOM
 * order = visual order, so the primary "I'm done" action doesn't outrank
 * printing/sharing a receipt for the customer standing there.
 *
 * design-fidelity Slice C (design obs #2224 §C5, owner decision #2218-4):
 * Imprimir/Compartir now sit side by side in their own row, DELIBERATELY
 * SUPERSEDING the full-width-stacked layout described above — the owner
 * explicitly asked for the horizontal pair to match the design. DOM order
 * is unchanged (Imprimir → Compartir → Volver al inicio), so the primary
 * action is still visually/structurally LAST.
 *
 * design-fidelity post-audit structural fix (pencil frame "Éxito ·
 * Devolución registrada", owner-confirmed): brought to parity with
 * `RentalCreatedSummary`'s own post-audit fix (Fix 2) — the title is
 * neutral-dark "Devolución registrada" with a SEPARATE circular
 * `bg-success-soft` check badge above it (not inline "✓" text), the
 * summary rows moved from a bare `dl` into a `bg-muted` gray card, the
 * print-failure message is an amber `bg-warning-soft`/`text-warning-soft-foreground`
 * banner with a `TriangleAlert` icon (copy corrected to remove "correctamente" —
 * same reasoning as `RentalCreatedSummary`: never imply anything printed
 * successfully in a message about it failing to print), "Compartir
 * comprobante" is shortened to "Compartir", and Compartir is now
 * `variant="secondary"` (was `outline`) so both buttons render identically,
 * matching the design's uniform gray pair. The `printStatus === "printed"`
 * line intentionally stays a plain `text-success` line (not a banner) —
 * `RentalCreatedSummary`'s own printed-state treatment wasn't changed by
 * its Fix 2 either, so this keeps the two summaries in the same asymmetric
 * shape the owner already approved, even though this flow's own pencil
 * frame shows a green success banner there too.
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface ReturnCreatedSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReturnReceiptData | null;
  onGoHome: () => void;
}

export function ReturnCreatedSummary({
  open,
  onOpenChange,
  receipt,
  onGoHome,
}: ReturnCreatedSummaryProps) {
  const { printAvailable, printStatus, shareAvailable, handlePrint, handleShare, reset } =
    useReceiptActions(receipt, open, isAutoPrintEnabled());

  const printerConnected = printAvailable && webBluetoothPrinter.isConnected;

  return (
    <Dialog
      open={open}
      // This dialog always opens in the SAME commit that closes both
      // `ReturnDialog`'s Sheet and the parent `RentalDetailSheet` (see
      // `RentalDetailSheet.tsx`'s `onReturned`) — real-device testing found
      // that "Aceptar" could then land the app on a totally different
      // screen instead of just dismissing this popup. Root cause: the
      // shared `useHistoryBackClose` hook pushes one raw history entry per
      // open modal; with two sheets closing (each popping their own entry
      // via a deferred `history.back()`) at the exact moment this dialog's
      // own entry gets pushed, whichever `back()` fires next can end up
      // popping THIS dialog's freshly-pushed entry instead of its intended
      // target, leaving the two real entries unbalanced. Opting this
      // terminal, always-explicitly-dismissed confirmation out of that
      // bookkeeping removes it from that race entirely.
      manageHistory={false}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {receipt && (
          <>
            <DialogHeader>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-success-soft flex size-12 items-center justify-center rounded-full">
                  <Check aria-hidden="true" className="text-success size-6" />
                </div>
                <DialogTitle>Devolución registrada</DialogTitle>
              </div>
              <DialogDescription>Folio {receipt.folio}</DialogDescription>
            </DialogHeader>

            <dl className="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-semibold text-foreground">{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Monto cobrado</dt>
                <dd className="font-semibold text-foreground">{currencyFormatter.format(receipt.amountCollected)}</dd>
              </div>
              {receipt.depositReturned > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Depósito devuelto</dt>
                  <dd className="font-semibold text-foreground">{currencyFormatter.format(receipt.depositReturned)}</dd>
                </div>
              )}
            </dl>

            {printStatus === "failed" && (
              <div className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p>
                  La devolución se guardó, pero no se pudo imprimir el comprobante.
                </p>
              </div>
            )}
            {printStatus === "printed" && (
              <p className="text-success text-sm">Comprobante impreso.</p>
            )}

            <DialogFooter className="flex-col items-stretch gap-2">
              {(printAvailable || shareAvailable) && (
                <div className="flex flex-row gap-2">
                  {printAvailable && (
                    <Button
                      type="button"
                      variant="secondary"
                      size={printerConnected ? "lg" : "default"}
                      onClick={() => void handlePrint()}
                      disabled={printStatus === "printing"}
                      className="flex-1"
                    >
                      {printStatus === "printed"
                        ? "Imprimir nuevamente"
                        : "Imprimir"}
                    </Button>
                  )}
                  {shareAvailable && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleShare()}
                      className="flex-1"
                    >
                      Compartir
                    </Button>
                  )}
                </div>
              )}
              <Button type="button" onClick={onGoHome} className="w-full">
                Aceptar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
