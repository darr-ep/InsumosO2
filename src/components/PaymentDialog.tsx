import { useState } from "react";
import { toast } from "sonner";
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
import { PaymentSuggestionField } from "@/components/PaymentSuggestionField";
import { createPayment } from "@/data/payments.repo";
import type { PaymentRecord } from "@/data/rentals.repo";
import {
  paymentFormSchema,
  type PaymentDialogType,
} from "@/domain/payments/payment";

/**
 * SDD.md §7.2 (flujo Registrar pago) + §16.6 (modal sobre Detalle de renta)
 * + §11.2 (adjustment) + CU5. Only creates `rent`/`adjustment` payments —
 * `deposit` is created exclusively at "Nueva renta" (task 1.4). Wiring this
 * dialog onto Detalle de renta's "Registrar pago" button is Phase 3 (task
 * 3.5, once RentalDetailSheet — task 3.3 — exists); built and tested
 * standalone here, same shape ReceiptDialog had before Phase 1's
 * RentalNewScreen wired it in.
 */

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string;
  suggestedAmount: number;
  hasPreviousRentPayment: boolean;
  onRegistered?: (payment: PaymentRecord) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  rentalId,
  suggestedAmount,
  hasPreviousRentPayment,
  onRegistered,
}: PaymentDialogProps) {
  const [mode, setMode] = useState<PaymentDialogType>("rent");
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // React's recommended "adjust state during render" pattern for resetting
  // state when a prop changes (https://react.dev/learn/you-might-not-need-an-effect)
  // instead of a useEffect — §7.2: "monto sugerido = último pago (editable)"
  // needs to re-seed every time the dialog opens fresh, possibly for a
  // different rental.
  if (open && !wasOpen) {
    setWasOpen(true);
    setMode("rent");
    setAmount(String(suggestedAmount));
    setNote("");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function handleConfirm() {
    setFormError(null);

    const parsed = paymentFormSchema.safeParse({
      payment_type: mode,
      amount: Number(amount || 0),
      note,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa los datos del pago.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payment = await createPayment({
        rentalId,
        amount: parsed.data.amount,
        paymentType: parsed.data.payment_type,
        note: parsed.data.note ? parsed.data.note : undefined,
      });

      onRegistered?.(payment);
      // §16.13/§17 (gap-fill finding 4): the sheet behind this dialog
      // updates silently on success — a Toast gives explicit confirmation
      // ("pago registrado", §17's own example) instead of leaving the user
      // to notice the change on their own.
      toast.success("Pago registrado.");
      onOpenChange(false);
    } catch {
      // §21: never show "saved" when the write failed — keep the form as
      // the user left it so they can retry without recapturing everything.
      setFormError(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "rent" ? "default" : "outline"}
            onClick={() => setMode("rent")}
          >
            Pago
          </Button>
          <Button
            type="button"
            variant={mode === "adjustment" ? "default" : "outline"}
            onClick={() => setMode("adjustment")}
          >
            Ajuste
          </Button>
        </div>

        {mode === "rent" ? (
          <PaymentSuggestionField
            suggestedAmount={suggestedAmount}
            value={amount}
            onChange={setAmount}
            hasPreviousPayment={hasPreviousRentPayment}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Monto del ajuste</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        )}

        {mode === "adjustment" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">Nota</Label>
            <Input
              id="payment-note"
              placeholder="Explica el motivo del ajuste"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}

        {formError && <p className="text-destructive text-sm">{formError}</p>}

        <DialogFooter>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleConfirm()}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
