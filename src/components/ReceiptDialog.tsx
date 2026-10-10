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
import { paymentTypeLabel } from "@/domain/payments/payment";
import { useReceiptActions } from "@/printing/useReceiptActions";
import { formatDateDisplay } from "@/lib/formatDate";

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
                className="mx-auto h-10 w-auto max-w-[180px] object-contain"
              />
              <DialogTitle>
                {receipt.kind === "return"
                  ? `Comprobante de devolución ${receipt.folio}`
                  : receipt.kind === "payment"
                    ? `Comprobante de pago ${receipt.folio}`
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
                  <dd>{formatDateDisplay(receipt.startedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fecha de devolución</dt>
                  <dd>{formatDateDisplay(receipt.returnedAt)}</dd>
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
                {receipt.note && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nota</dt>
                    <dd className="text-right">{receipt.note}</dd>
                  </div>
                )}
              </dl>
            ) : receipt.kind === "payment" ? (
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
                  <dd>{formatDateDisplay(receipt.date)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>{paymentTypeLabel(receipt.paymentType)}</dt>
                  <dd>{currencyFormatter.format(receipt.amount)}</dd>
                </div>
                {receipt.note && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nota</dt>
                    <dd className="text-right">{receipt.note}</dd>
                  </div>
                )}
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
                  <dd>{formatDateDisplay(receipt.date)}</dd>
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
