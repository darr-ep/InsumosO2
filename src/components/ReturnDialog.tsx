import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { returnRental } from "@/data/rentals.repo";
import { daysSince } from "@/domain/rentals/dashboard";
import {
  buildReturnReceipt,
  type ReceiptItemLine,
  type ReturnReceiptData,
} from "@/domain/rentals/receipt";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import { returnFormSchema, suggestedDepositReturn } from "@/domain/rentals/return";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.3 (flujo Devolución) + §16.8 + §16.10 (acción "Devolver" sobre
 * Detalle de renta) + CU6. Task 3.2 — wired onto `RentalDetailSheet`'s
 * "Devolver" button (task 3.3/3.5), never inside a menu (§16.2/§17).
 * `rentals.status` never changes client-side directly — this always calls
 * `data/rentals.repo.ts#returnRental`, the thin wrapper over the custom
 * `POST /api/rentals/{id}/return` endpoint (§19.1, task 3.1).
 */

export interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string;
  businessName: string;
  businessPhone: string;
  folio: string;
  customerName: string;
  customerPhone: string;
  items: ReceiptItemLine[];
  startedAt: Date;
  depositAmount: number;
  suggestedAmount: number;
  hasPreviousRentPayment: boolean;
  onReturned?: (receipt: ReturnReceiptData) => void;
}

export function ReturnDialog({
  open,
  onOpenChange,
  rentalId,
  businessName,
  businessPhone,
  folio,
  customerName,
  customerPhone,
  items,
  startedAt,
  depositAmount,
  suggestedAmount,
  hasPreviousRentPayment,
  onReturned,
}: ReturnDialogProps) {
  const [amountCollected, setAmountCollected] = useState(
    String(suggestedAmount),
  );
  const [depositReturned, setDepositReturned] = useState(
    String(suggestedDepositReturn(depositAmount)),
  );
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Same "adjust state during render" pattern PaymentDialog uses (task
  // 2.4) instead of a useEffect, to re-seed the suggested amounts every
  // time the dialog opens fresh, possibly for a different rental.
  if (open && !wasOpen) {
    setWasOpen(true);
    setAmountCollected(String(suggestedAmount));
    setDepositReturned(String(suggestedDepositReturn(depositAmount)));
    setNote("");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const elapsedDays = daysSince(startedAt);

  async function handleConfirm() {
    setFormError(null);

    const parsed = returnFormSchema.safeParse({
      amount_collected: Number(amountCollected || 0),
      deposit_returned: Number(depositReturned || 0),
      note,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa los datos de la devolución.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const rental = await returnRental({
        rentalId,
        amountCollected: parsed.data.amount_collected,
        depositReturned: parsed.data.deposit_returned,
        note: parsed.data.note ? parsed.data.note : undefined,
      });

      onReturned?.(
        buildReturnReceipt({
          businessName,
          businessPhone,
          folio,
          customerName,
          customerPhone,
          startedAt,
          returnedAt: new Date(rental.returned_at),
          amountCollected: parsed.data.amount_collected,
          depositReturned: parsed.data.deposit_returned,
        }),
      );
      onOpenChange(false);
    } catch {
      // §21: never show "saved" when the write failed — keep the form as
      // the user left it so they can retry without recapturing everything.
      setFormError(
        "No se pudo registrar la devolución. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver renta {folio}</DialogTitle>
        </DialogHeader>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>{customerName}</dd>
          </div>
          {items.map((item) => (
            <div className="flex justify-between" key={item.itemType}>
              <dt className="text-muted-foreground">
                {rentalItemTypeLabel(item.itemType)}
              </dt>
              <dd>x{item.quantity}</dd>
            </div>
          ))}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Fecha de inicio</dt>
            <dd>{startedAt.toLocaleDateString("es-MX")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tiempo transcurrido</dt>
            <dd>{elapsedDays} días</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Depósito</dt>
            <dd>{formatCurrencyMXN(depositAmount)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-amount-collected">
            {hasPreviousRentPayment ? "Monto sugerido" : "Renta"} — monto
            cobrado
          </Label>
          <Input
            id="return-amount-collected"
            type="number"
            inputMode="decimal"
            value={amountCollected}
            onChange={(event) => setAmountCollected(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-deposit-returned">Depósito a devolver</Label>
          <Input
            id="return-deposit-returned"
            type="number"
            inputMode="decimal"
            value={depositReturned}
            onChange={(event) => setDepositReturned(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-note">Nota (opcional)</Label>
          <Input
            id="return-note"
            placeholder="Observaciones sobre la devolución"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <DialogFooter>
          <Button
            type="button"
            size="lg"
            disabled={isSubmitting}
            onClick={() => void handleConfirm()}
          >
            Confirmar devolución
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
