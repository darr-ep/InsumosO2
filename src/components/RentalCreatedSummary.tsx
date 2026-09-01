import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import type { RentalReceiptData } from "@/domain/rentals/receipt";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { isAutoPrintEnabled } from "@/printing/printSettings";
import { useReceiptActions } from "@/printing/useReceiptActions";

/**
 * Redesign Round 3, punto 1 (post-creación de renta): reemplaza la apertura
 * inmediata del comprobante completo por una confirmación corta. El
 * comprobante completo sigue existiendo — se abre desde "Ver comprobante"
 * (`onViewReceipt`), no como vista principal.
 *
 * Reusa `useReceiptActions` (mismo hook que `ReceiptDialog`) para no
 * duplicar la orquestación de impresión/compartir Bluetooth-first — incluye
 * el auto-print silencioso si la impresora ya está conectada y la
 * preferencia "auto-imprimir al guardar" (`printSettings.ts`, toggle en
 * `PrinterMenu`) está activada.
 *
 * Batch B fix: `DialogFooter`'s own default is `flex-col-reverse` at the
 * base breakpoint, which was flipping the visual order on mobile — the
 * LAST button in this JSX ("Continuar") rendered on TOP, and "Imprimir
 * comprobante" (the button that's supposed to be "muy evidente" when a
 * printer is connected) rendered at the bottom. `flex-col items-stretch`
 * (no `sm:` prefix, forced at every breakpoint) keeps DOM order = visual
 * order everywhere, so Imprimir is genuinely first/most prominent.
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface RentalCreatedSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: RentalReceiptData | null;
  onViewReceipt: () => void;
  onContinue: () => void;
}

export function RentalCreatedSummary({
  open,
  onOpenChange,
  receipt,
  onViewReceipt,
  onContinue,
}: RentalCreatedSummaryProps) {
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
                Renta creada ✓
              </DialogTitle>
              <DialogDescription>Folio {receipt.folio}</DialogDescription>
            </DialogHeader>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd>{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Producto(s)</dt>
                <dd className="text-right">
                  {receipt.items
                    .map(
                      (item) =>
                        `${item.quantity} x ${rentalItemTypeLabel(item.itemType)}`,
                    )
                    .join(", ")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Renta</dt>
                <dd>{currencyFormatter.format(receipt.initialRentAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Depósito</dt>
                <dd>{currencyFormatter.format(receipt.depositAmount)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{currencyFormatter.format(receipt.total)}</dd>
              </div>
            </dl>

            {printStatus === "failed" && (
              <p className="text-destructive text-sm">
                La renta se guardó correctamente, pero no se pudo imprimir el
                comprobante.
              </p>
            )}
            {printStatus === "printed" && (
              <p className="text-success text-sm">Comprobante impreso.</p>
            )}

            <DialogFooter className="flex-col items-stretch">
              {printAvailable && (
                <Button
                  type="button"
                  size={printerConnected ? "lg" : "default"}
                  onClick={() => void handlePrint()}
                  disabled={printStatus === "printing"}
                  className="w-full"
                >
                  {printStatus === "failed"
                    ? "Reintentar impresión"
                    : "Imprimir comprobante"}
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
              <Button
                type="button"
                variant="ghost"
                onClick={onViewReceipt}
                className="w-full"
              >
                Ver comprobante
              </Button>
              <Button
                type="button"
                variant={printAvailable ? "outline" : "default"}
                onClick={onContinue}
                className="w-full"
              >
                Continuar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
