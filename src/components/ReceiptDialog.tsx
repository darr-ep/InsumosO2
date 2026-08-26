import { useState } from "react";
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
import type { ReceiptData } from "@/domain/rentals/receipt";
import {
  isShareAvailable,
  shareReceipt,
} from "@/printing/ShareFallbackPrinter";

/**
 * SDD.md §22 (generación de comprobantes — modal, no pantalla/ruta aparte,
 * de renta y de devolución) + §21 (compartir es opcional, nunca
 * bloqueante) + §18 (Nueva renta → confirmar → modal Comprobante; Devolver
 * → confirmar → modal Comprobante de devolución) + §16.6. One shared modal
 * for both flows (task 1.9, extended task 3.2) — `receipt.kind`
 * discriminates the content.
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData | null;
}

export function ReceiptDialog({
  open,
  onOpenChange,
  receipt,
}: ReceiptDialogProps) {
  const [shareStatus, setShareStatus] = useState<
    "idle" | "shared" | "error"
  >("idle");

  async function handleShare() {
    if (!receipt) {
      return;
    }

    const result = await shareReceipt(receipt);

    if (result === "shared") {
      setShareStatus("shared");
    } else if (result === "failed") {
      setShareStatus("error");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setShareStatus("idle");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        {receipt && (
          <>
            <DialogHeader>
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
                  <div
                    className="flex justify-between"
                    key={item.itemType}
                  >
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
              <p className="text-muted-foreground text-sm">
                Comprobante compartido.
              </p>
            )}

            <DialogFooter>
              {isShareAvailable() && (
                <Button type="button" variant="outline" onClick={handleShare}>
                  Compartir
                </Button>
              )}
              <Button type="button" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
