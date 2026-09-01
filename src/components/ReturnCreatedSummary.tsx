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

/**
 * Redesign Round 3, punto 5 (devolución): mantiene el flujo existente
 * (Detalle → Devolver → confirmación → renta devuelta) pero, tras devolver,
 * muestra una confirmación breve en vez del comprobante completo — el
 * comprobante completo sigue existiendo vía "Ver comprobante".
 */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export interface ReturnCreatedSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReturnReceiptData | null;
  onViewReceipt: () => void;
  onGoHome: () => void;
}

export function ReturnCreatedSummary({
  open,
  onOpenChange,
  receipt,
  onViewReceipt,
  onGoHome,
}: ReturnCreatedSummaryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

            <DialogFooter className="flex-col items-stretch">
              <Button
                type="button"
                variant="outline"
                onClick={onViewReceipt}
                className="w-full"
              >
                Ver comprobante
              </Button>
              <Button
                type="button"
                onClick={onGoHome}
                className="w-full"
              >
                Volver al inicio
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
