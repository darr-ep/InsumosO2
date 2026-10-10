import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingDialog } from "@/components/LoadingDialog";
import { deletePayment, updatePayment } from "@/data/payments.repo";
import type { PaymentRecord, PaymentWithUser } from "@/data/rentals.repo";
import { paymentEditSchema } from "@/domain/rentals/rentalEdit";
import { formatCurrencyMXN } from "@/lib/currency";
import { handleIfStaleSession } from "@/data/staleSession";

export interface PaymentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentWithUser | null;
  customerName?: string;
  onPaymentUpdated?: (updated: PaymentRecord) => void;
  onPaymentDeleted?: (paymentId: string) => void;
}

export function PaymentEditDialog({
  open,
  onOpenChange,
  payment,
  onPaymentUpdated,
  onPaymentDeleted,
}: PaymentEditDialogProps) {
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [note, setNote] = useState(payment?.note || "");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevPaymentId, setPrevPaymentId] = useState<string | null>(
    payment?.id ?? null,
  );
  const [prevOpen, setPrevOpen] = useState(open);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (open && (!prevOpen || payment?.id !== prevPaymentId)) {
    setPrevOpen(true);
    setPrevPaymentId(payment?.id ?? null);
    setAmount(payment ? String(payment.amount) : "");
    setNote(payment?.note || "");
    setFormError(null);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  async function handleSave() {
    if (!payment) return;
    setFormError(null);

    const parsed = paymentEditSchema.safeParse({
      amount: Number(amount || 0),
      note: note.trim() ? note.trim() : undefined,
    });

    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa los datos del pago.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updatePayment(payment.id, {
        amount: parsed.data.amount,
        note: parsed.data.note,
      });
      toast.success("Pago actualizado correctamente");
      onOpenChange(false);
      onPaymentUpdated?.(updated);
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      setFormError("No se pudo actualizar el pago. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!payment) return;
    setIsDeleting(true);
    try {
      await deletePayment(payment.id);
      toast.success("Pago eliminado correctamente");
      setConfirmDeleteOpen(false);
      onOpenChange(false);
      onPaymentDeleted?.(payment.id);
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      toast.error("No se pudo eliminar el pago. Intenta de nuevo.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader className="border-b-0 pl-4 pr-12 text-left items-start justify-start">
            <DialogTitle className="text-left text-lg font-semibold text-foreground">
              Editar pago
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-edit-amount" required>
                Monto
              </Label>
              <CurrencyInput
                id="payment-edit-amount"
                placeholder="$ 0"
                value={amount}
                onChange={setAmount}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-edit-note">Nota (opcional)</Label>
              <Input
                id="payment-edit-note"
                placeholder="Observaciones o comentarios"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}

            <div className="pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 flex items-center justify-center gap-2"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Eliminar pago
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 items-stretch mt-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={isSubmitting}
              onClick={() => void handleSave()}
              className="flex-1"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payment && (
        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title="¿Eliminar este pago?"
          description={`Se eliminará permanentemente el registro de este pago por ${formatCurrencyMXN(payment.amount)}. Esta acción no se puede deshacer.`}
          confirmLabel={isDeleting ? "Eliminando..." : "Sí, eliminar pago"}
          tone="destructive"
          isConfirming={isDeleting}
          onConfirm={() => void handleDelete()}
        />
      )}

      <LoadingDialog
        open={isSubmitting}
        manageHistory={false}
        title="Guardando cambios..."
        description="Estamos actualizando la información del pago."
      />
    </>
  );
}
