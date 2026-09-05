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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { PaymentSuggestionField } from "@/components/PaymentSuggestionField";
import { createPayment } from "@/data/payments.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import type { PaymentRecord } from "@/data/rentals.repo";
import {
  paymentFormSchema,
  type PaymentDialogType,
  type PaymentFormValues,
} from "@/domain/payments/payment";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.2 (flujo Registrar pago) + §16.6 (modal sobre Detalle de renta)
 * + §11.2 (adjustment) + CU5. Only creates `rent`/`adjustment` payments —
 * `deposit` is created exclusively at "Nueva renta" (task 1.4). Wiring this
 * dialog onto Detalle de renta's "Registrar pago" button is Phase 3 (task
 * 3.5, once RentalDetailSheet — task 3.3 — exists); built and tested
 * standalone here, same shape ReceiptDialog had before Phase 1's
 * RentalNewScreen wired it in.
 *
 * design-fidelity (Slice B1, obs #2221/#2222/#2223/#2224, call sites #2/#3):
 * per owner decision #2222 (round 3), BOTH `rent` and `adjustment` payments
 * confirm on EVERY submission — no exception for high frequency or amount.
 * The confirm gate goes AFTER local validation and BEFORE the repo call
 * (design B4 detail), so a validation error (e.g. missing adjustment note)
 * never shows the popup. `ConfirmDialog` renders as a JSX SIBLING of this
 * `Dialog` (design B3 nesting pattern) — this dialog is itself opened from
 * inside `RentalDetailSheet`'s already-open `Sheet`, so the stack is
 * Sheet → Dialog → ConfirmDialog, each a sibling of the last.
 */

export interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string;
  folio: string;
  suggestedAmount: number;
  initialRentAmount: number;
  hasPreviousRentPayment: boolean;
  onRegistered?: (payment: PaymentRecord) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  rentalId,
  folio,
  suggestedAmount,
  initialRentAmount,
  hasPreviousRentPayment,
  onRegistered,
}: PaymentDialogProps) {
  const [mode, setMode] = useState<PaymentDialogType>("rent");
  // Redesign — UX/UI pass: starts empty (placeholder shows the suggestion
  // instead, see PaymentSuggestionField) so a rushed confirm can never
  // silently accept a stale/wrong prefilled number — the visitor must type
  // an actual amount.
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayment, setPendingPayment] =
    useState<PaymentFormValues | null>(null);

  // React's recommended "adjust state during render" pattern for resetting
  // state when a prop changes (https://react.dev/learn/you-might-not-need-an-effect)
  // instead of a useEffect — §7.2: "monto sugerido = último pago (editable)"
  // needs to re-seed every time the dialog opens fresh, possibly for a
  // different rental.
  if (open && !wasOpen) {
    setWasOpen(true);
    setMode("rent");
    setAmount("");
    setNote("");
    setFormError(null);
    setPendingPayment(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // design-fidelity B4: local validation happens here, BEFORE the confirm
  // popup ever appears — a validation error (e.g. an adjustment missing its
  // required note) must never show `ConfirmDialog`. Only a successfully
  // parsed payment opens it.
  function handleSubmitClick() {
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
        paymentType: pendingPayment.payment_type,
        note: pendingPayment.note ? pendingPayment.note : undefined,
      });

      onRegistered?.(payment);
      // §16.13/§17 (gap-fill finding 4): the sheet behind this dialog
      // updates silently on success — a Toast gives explicit confirmation
      // ("pago registrado", §17's own example) instead of leaving the user
      // to notice the change on their own.
      toast.success("Pago registrado.");
      onOpenChange(false);
    } catch (error) {
      // §14 gap-fill: a rotated/expired session (still locally "valid" per
      // `pb.authStore.isValid`) surfaces here as this exact generic
      // save-error — redirect to `/login` instead.
      if (handleIfStaleSession(error)) {
        return;
      }
      // §21: never show "saved" when the write failed — keep the form as
      // the user left it so they can retry without recapturing everything.
      setFormError(
        "No se pudo registrar el pago. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>

          {/* Pill-style mode toggle (post-launch polish): a deliberate, scoped
              exception to this app's h-11/44px minimum touch target — that
              floor is for PRIMARY actions (SDD §16.12/§17), not a compact
              in-row chip like this one. Was the only two-button toggle of
              this kind in the app — now extracted to `ui/segmented-toggle`
              (design-fidelity Slice C, design obs #2224 §C1) so
              `CustomerDetailSheet`'s Activas/Historial toggle can reuse the
              exact same pattern instead of drifting into a second copy. */}
          <SegmentedToggle
            value={mode}
            onChange={setMode}
            ariaLabel="Tipo de movimiento"
            options={[
              { value: "rent", label: "Pago" },
              { value: "adjustment", label: "Ajuste" },
            ]}
          />

          {mode === "rent" ? (
            <PaymentSuggestionField
              suggestedAmount={suggestedAmount}
              initialRentAmount={initialRentAmount}
              value={amount}
              onChange={setAmount}
              hasPreviousPayment={hasPreviousRentPayment}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount" required>
                Monto del ajuste
              </Label>
              {/* Plain Input, NOT CurrencyInput: an adjustment amount can be
                  negative (a discount/credit) — domain/payments/payment.ts's
                  schema only rejects exactly 0 for this mode, positive and
                  negative both valid. CurrencyInput strips everything but
                  digits (no "-"), which would silently make negative
                  adjustments impossible to type. */}
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                placeholder="$ 0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          )}

          {mode === "adjustment" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-note" required>
                Nota
              </Label>
              <Input
                id="payment-note"
                placeholder="Explica el motivo del ajuste"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}

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
              {isSubmitting ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          pendingPayment?.payment_type === "adjustment"
            ? "¿Registrar este ajuste?"
            : "¿Registrar este pago?"
        }
        description={
          pendingPayment?.payment_type === "adjustment"
            ? `Se registrará un ajuste de ${formatCurrencyMXN(pendingPayment?.amount ?? 0)} en la renta ${folio}. Los ajustes no se pueden editar ni borrar después.`
            : `Se registrará un pago de ${formatCurrencyMXN(pendingPayment?.amount ?? 0)} en la renta ${folio}. Los pagos no se pueden editar ni borrar después.`
        }
        confirmLabel="Sí, registrar"
        isConfirming={isSubmitting}
        onConfirm={handleConfirm}
      />
    </>
  );
}
