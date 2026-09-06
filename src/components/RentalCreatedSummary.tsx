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
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import type { RentalReceiptData } from "@/domain/rentals/receipt";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { isAutoPrintEnabled } from "@/printing/printSettings";
import { useReceiptActions } from "@/printing/useReceiptActions";

/**
 * Redesign Round 3, punto 1 (post-creación de renta): reemplaza la apertura
 * inmediata del comprobante completo por una confirmación corta — este
 * diálogo already shows every field of the receipt inline (see the `dl`
 * below), so there's no separate "ver comprobante completo" step anymore
 * (a dedicated button for that was removed as redundant — the user is
 * already looking at it).
 *
 * Reusa `useReceiptActions` (mismo hook que `ReceiptDialog`) para no
 * duplicar la orquestación de impresión/compartir Bluetooth-first — incluye
 * el auto-print silencioso si la impresora ya está conectada y la
 * preferencia "auto-imprimir al guardar" (`printSettings.ts`, toggle en
 * `PrinterMenu`) está activada.
 *
 * Button hierarchy (business-owner request, post-launch polish): "Imprimir"
 * is `variant="secondary"` — a real next step, but not THE final action —
 * and its label switches to "Imprimir nuevamente" once `printStatus ===
 * "printed"` (never a distinct "reintentar" wording; failed/not-yet-tried
 * both just read "Imprimir"). Tapping it while no printer is connected
 * already surfaces the browser's Bluetooth device picker via
 * `useReceiptActions`' `handlePrint` → `webBluetoothPrinter.connect()` — no
 * separate "connect printer" UI needed here. "Continuar" is the one
 * `variant="default"` (primary) button, and stays LAST in DOM order on
 * purpose: `DialogFooter`'s `flex-col items-stretch` (forced at every
 * breakpoint, overriding its own `flex-col-reverse` default) keeps DOM
 * order = visual order, so the print/share steps stay reachable first and
 * the primary "I'm done" action doesn't visually outrank them into being
 * tapped before a physical receipt is even printed for the customer.
 *
 * design-fidelity Slice C (design obs #2224 §C5, owner decision #2218-4):
 * Imprimir/Compartir now sit side by side in their own row, DELIBERATELY
 * SUPERSEDING the full-width-stacked layout the paragraph above describes
 * — the owner explicitly asked for the horizontal pair to match the
 * design. DOM order is unchanged (Imprimir → Compartir → Continuar), so
 * "Continuar" is still the visually/structurally LAST action; only the
 * print/share pair's own row became horizontal.
 *
 * design-fidelity post-audit bugfix batch (Fix 2, pencil frame `fcBBX`
 * `DialogoRentaCreada`): the title is neutral-dark text with a SEPARATE
 * circular green check badge (not green inline-checkmark title text); the
 * summary rows sit inside a gray `#F3F4F6` card, not a bare `dl`; the
 * print-failure message is an amber `#FEF3C7`/`#B45309` banner with a
 * `triangle-alert` icon, not plain red text; "Compartir" (not "Compartir
 * comprobante", which only ever matched `PrintShareBar`'s own already-
 * correct copy by coincidence); and Imprimir/Compartir are both
 * `variant="secondary"` so they render identically, matching the design's
 * uniform gray pair.
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface RentalCreatedSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: RentalReceiptData | null;
  onContinue: () => void;
}

export function RentalCreatedSummary({
  open,
  onOpenChange,
  receipt,
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
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-success-soft flex size-12 items-center justify-center rounded-full">
                  <Check aria-hidden="true" className="text-success size-6" />
                </div>
                <DialogTitle>Renta creada</DialogTitle>
              </div>
              <DialogDescription>Folio {receipt.folio}</DialogDescription>
            </DialogHeader>

            <dl className="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
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
              <div className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-700">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p>
                  La renta se guardó, pero no se pudo imprimir el comprobante.
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
              <Button
                type="button"
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
