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
import type { PaymentReceiptData } from "@/domain/rentals/receipt";
import { paymentTypeLabel } from "@/domain/payments/payment";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";
import { isAutoPrintEnabled } from "@/printing/printSettings";
import { useReceiptActions } from "@/printing/useReceiptActions";
import { formatDateDisplay } from "@/lib/formatDate";

/**
 * design-fidelity ("Éxito · Pago registrado" / "Éxito · Ajuste registrado"
 * pencil frames) — the "Registrar pago" success screen, missing until now
 * (PaymentDialog used to just `toast.success(...)` and close). Modeled
 * directly on `RentalCreatedSummary`/`ReturnCreatedSummary`'s already-
 * approved pattern (green check badge, gray summary card, amber
 * print-failure banner, Imprimir/Compartir secondary pair, "Aceptar"
 * primary last in DOM order, `useReceiptActions` for the
 * Bluetooth-first print/share + auto-print orchestration) rather than the
 * older, more generic `ReceiptDialog` — one component handles both
 * `paymentType` values ("rent"/"adjustment"; "deposit" is never created
 * from `PaymentDialog`), since the two design frames are structurally
 * identical apart from the amount-row label and the conditional Nota row.
 */
const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface PaymentCreatedSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: PaymentReceiptData | null;
  onContinue: () => void;
}

export function PaymentCreatedSummary({
  open,
  onOpenChange,
  receipt,
  onContinue,
}: PaymentCreatedSummaryProps) {
  const { printAvailable, printStatus, shareAvailable, handlePrint, handleShare, reset } =
    useReceiptActions(receipt, open, isAutoPrintEnabled());

  const printerConnected = printAvailable && webBluetoothPrinter.isConnected;

  return (
    <Dialog
      open={open}
      // See ReturnCreatedSummary's identical `manageHistory={false}` for
      // the full root cause: this dialog opens in the same commit that
      // closes PaymentDialog's own Sheet, and letting both manage the
      // shared raw-history bookkeeping at once risked one's self-cleanup
      // `history.back()` consuming the other's freshly-pushed entry.
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
            <DialogHeader className="border-b-0">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="bg-success-soft flex size-12 items-center justify-center rounded-full">
                  <Check aria-hidden="true" className="text-success size-6" />
                </div>
                <DialogTitle>
                  {receipt.paymentType === "adjustment"
                    ? "Ajuste registrado"
                    : "Pago registrado"}
                </DialogTitle>
              </div>
              <DialogDescription>Folio {receipt.folio}</DialogDescription>
            </DialogHeader>

            <dl className="bg-muted flex flex-col gap-2 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-semibold text-foreground">{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fecha</dt>
                <dd className="font-semibold text-foreground">{formatDateDisplay(receipt.date)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>
                  {receipt.paymentType === "adjustment"
                    ? "Monto ajustado"
                    : paymentTypeLabel(receipt.paymentType)}
                </dt>
                <dd className="font-semibold text-success">
                  {currencyFormatter.format(receipt.amount)}
                </dd>
              </div>
              {receipt.note && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Nota</dt>
                  <dd className="font-semibold text-foreground text-right">{receipt.note}</dd>
                </div>
              )}
            </dl>

            {printStatus === "failed" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p>
                  {receipt.paymentType === "adjustment"
                    ? "El ajuste se guardó, pero no se pudo imprimir el comprobante."
                    : "El pago se guardó, pero no se pudo imprimir el comprobante."}
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
              <Button type="button" onClick={onContinue} className="w-full">
                Aceptar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
