import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrintShareBar } from "@/components/PrintShareBar";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import type { ReceiptData } from "@/domain/rentals/receipt";
import { useReceiptActions } from "@/printing/useReceiptActions";

/**
 * SDD.md §22 (generación de comprobantes — modal, no pantalla/ruta aparte,
 * de renta y de devolución) + §21 (compartir es opcional, nunca
 * bloqueante) + §18 (Nueva renta → confirmar → modal Comprobante; Devolver
 * → confirmar → modal Comprobante de devolución) + §16.6. One shared modal
 * for both flows (task 1.9, extended task 3.2) — `receipt.kind`
 * discriminates the content.
 *
 * §23.2/§23.3/§23.4/CU8 (task 5.4): Bluetooth printing is tried first when
 * available (`webBluetoothPrinter.isAvailable()` — resolves `false` on
 * unsupported browsers/devices such as iOS Safari, so the button simply
 * never appears there, per CU8's iPhone scenario). Any failure — no
 * printer available, connection failure, write failure — shows §21's
 * exact message plus a retry option; `Compartir` (`ShareFallbackPrinter`)
 * always stays available alongside it. Printing never touches
 * `onOpenChange` — the rental is already saved by the time this dialog
 * is open, regardless of print outcome (§23's "regla de oro").
 *
 * Redesign Round 3: print/share orchestration lives in `useReceiptActions`
 * now, shared with the short post-creation confirmation
 * (`RentalCreatedSummary`) so neither duplicates the Bluetooth-first flow.
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
  autoPrint?: boolean;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  receipt,
  autoPrint = true,
}: ReceiptDialogProps) {
  const {
    shareStatus,
    printAvailable,
    printStatus,
    shareAvailable,
    handleShare,
    handlePrint,
    reset,
  } = useReceiptActions(receipt, open, autoPrint);

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
              <img
                src="/logo.png"
                alt={receipt.businessName}
                className="mx-auto size-12"
              />
              <DialogTitle>
                {receipt.kind === "return"
                  ? `Comprobante de devolución ${receipt.folio}`
                  : `Comprobante ${receipt.folio}`}
              </DialogTitle>
              <DialogDescription>
                {receipt.businessName} · {receipt.businessPhone}
              </DialogDescription>
            </DialogHeader>

            {receipt.kind === "return" ? (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd>{receipt.customerName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Teléfono</dt>
                  <dd>{receipt.customerPhone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fecha de inicio</dt>
                  <dd>{receipt.startedAt.toLocaleDateString("es-MX")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fecha de devolución</dt>
                  <dd>{receipt.returnedAt.toLocaleDateString("es-MX")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tiempo rentado</dt>
                  <dd>{receipt.rentedDays} días</dd>
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
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd>{receipt.customerName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Teléfono</dt>
                  <dd>{receipt.customerPhone}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd>{receipt.date.toLocaleDateString("es-MX")}</dd>
                </div>
                {receipt.items.map((item) => (
                  <div className="flex justify-between" key={item.itemType}>
                    <dt className="text-muted-foreground">
                      {rentalItemTypeLabel(item.itemType)}
                    </dt>
                    <dd>x{item.quantity}</dd>
                  </div>
                ))}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Renta inicial</dt>
                  <dd>{currencyFormatter.format(receipt.initialRentAmount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Depósito</dt>
                  <dd>{currencyFormatter.format(receipt.depositAmount)}</dd>
                </div>
                {receipt.extras.map((extra) => (
                  <div className="flex justify-between" key={extra.description}>
                    <dt className="text-muted-foreground">
                      {extra.description}
                    </dt>
                    <dd>{currencyFormatter.format(extra.price)}</dd>
                  </div>
                ))}
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt>
                  <dd>{currencyFormatter.format(receipt.total)}</dd>
                </div>
              </dl>
            )}

            {shareStatus === "error" && (
              <p className="text-destructive text-sm">
                No se pudo compartir el comprobante.
              </p>
            )}
            {shareStatus === "shared" && (
              <p className="text-success text-sm">Comprobante compartido.</p>
            )}
            {printStatus === "failed" && (
              <p className="text-destructive text-sm">
                La renta se guardó correctamente, pero no se pudo imprimir el
                comprobante.
              </p>
            )}
            {printStatus === "printed" && (
              <p className="text-success text-sm">Comprobante impreso.</p>
            )}

            <PrintShareBar
              printAvailable={printAvailable}
              printStatus={printStatus}
              onPrint={() => void handlePrint()}
              shareAvailable={shareAvailable}
              onShare={() => void handleShare()}
              onClose={() => onOpenChange(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
