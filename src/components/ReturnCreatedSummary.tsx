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
              <DialogTitle className="text-success">
                Devolución registrada ✓
              </DialogTitle>
              <DialogDescription>Folio {receipt.folio}</DialogDescription>
            </DialogHeader>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd>{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Monto cobrado</dt>
                <dd>{currencyFormatter.format(receipt.amountCollected)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Depósito devuelto</dt>
                <dd>{currencyFormatter.format(receipt.depositReturned)}</dd>
              </div>
            </dl>

            {printStatus === "failed" && (
              <p className="text-destructive text-sm">
                La devolución se guardó correctamente, pero no se pudo
                imprimir el comprobante.
              </p>
            )}
            {printStatus === "printed" && (
              <p className="text-success text-sm">Comprobante impreso.</p>
            )}

            <DialogFooter className="flex-col items-stretch">
              {printAvailable && (
                <Button
                  type="button"
                  variant="secondary"
                  size={printerConnected ? "lg" : "default"}
                  onClick={() => void handlePrint()}
                  disabled={printStatus === "printing"}
                  className="w-full"
                >
                  {printStatus === "printed" ? "Imprimir nuevamente" : "Imprimir"}
                </Button>
              )}
              {shareAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleShare()}
                  className="w-full"
                >
                  Compartir comprobante
                </Button>
              )}
              <Button type="button" onClick={onGoHome} className="w-full">
                Volver al inicio
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
