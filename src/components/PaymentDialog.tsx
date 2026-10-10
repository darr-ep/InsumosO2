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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingDialog } from "@/components/LoadingDialog";
import { PaymentSuggestionField } from "@/components/PaymentSuggestionField";
import { createPayment } from "@/data/payments.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import type { PaymentRecord } from "@/data/rentals.repo";
import {
  paymentFormSchema,
  type PaymentFormValues,
} from "@/domain/payments/payment";
import { buildPaymentReceipt, type PaymentReceiptData } from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.2 (flujo Registrar pago) + §16.6 (modal sobre Detalle de renta)
 * + CU5. Only creates `rent` payments —
 * `deposit` is created exclusively at "Nueva renta" (task 1.4).
 */

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string;
  folio: string;
  businessName: string;
  businessPhone: string;
  customerName: string;
  customerPhone: string;
  suggestedAmount: number;
  initialRentAmount: number;
  hasPreviousRentPayment: boolean;
  onRegistered?: (payment: PaymentRecord, receipt: PaymentReceiptData) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  rentalId,
  folio,
  businessName,
  businessPhone,
  customerName,
  customerPhone,
  suggestedAmount,
  initialRentAmount,
  hasPreviousRentPayment,
  onRegistered,
}: PaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayment, setPendingPayment] =
    useState<PaymentFormValues | null>(null);

  if (open && !wasOpen) {
    setWasOpen(true);
    setAmount("");
    setNote("");
    setFormError(null);
    setPendingPayment(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function handleSubmitClick() {
    setFormError(null);

    const parsed = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: Number(amount || 0),
      note: note.trim() ? note.trim() : undefined,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa los datos del pago.",
      );
      return;
    }

    setPendingPayment(parsed.data);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!pendingPayment) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payment = await createPayment({
        rentalId,
        amount: pendingPayment.amount,
        paymentType: "rent",
        note: pendingPayment.note ? pendingPayment.note : undefined,
      });

      onRegistered?.(
        payment,
        buildPaymentReceipt({
          businessName,
          businessPhone,
          folio,
          customerName,
          customerPhone,
          paymentType: "rent",
          amount: pendingPayment.amount,
          date: new Date(payment.created),
          note: pendingPayment.note ? pendingPayment.note : undefined,
        }),
      );
      onOpenChange(false);
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      setFormError(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader className="border-b-0 pl-4 pr-12 text-left items-start justify-start">
            <DialogTitle className="text-left text-lg font-semibold text-foreground">
              Registrar pago
            </DialogTitle>
          </DialogHeader>

          <PaymentSuggestionField
            suggestedAmount={suggestedAmount}
            initialRentAmount={initialRentAmount}
            value={amount}
            onChange={setAmount}
            hasPreviousPayment={hasPreviousRentPayment}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">Nota (opcional)</Label>
            <Input
              id="payment-note"
              placeholder="Observaciones o comentarios"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {formError && (
            <p className="text-destructive text-sm">{formError}</p>
          )}

          <DialogFooter className="flex-col items-stretch">
            <Button
              type="button"
              size="lg"
              disabled={isSubmitting}
              onClick={handleSubmitClick}
              className="w-full"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Registrar este pago?"
        description={`Se registrará un pago de ${formatCurrencyMXN(pendingPayment?.amount ?? 0)} en la renta de ${customerName}.`}
        confirmLabel="Sí, registrar"
        onConfirm={() => {
          setConfirmOpen(false);
          void handleConfirm();
        }}
      />

      <LoadingDialog
        open={isSubmitting}
        manageHistory={false}
        title="Procesando pago..."
        description="Estamos registrando el pago de la renta."
      />
    </>
  );
}
