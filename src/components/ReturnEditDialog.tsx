import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingDialog } from "@/components/LoadingDialog";
import { updateReturnDetails } from "@/data/rentals.repo";
import type { RentalRecord } from "@/data/rentals.repo";
import { handleIfStaleSession } from "@/data/staleSession";

/**
 * Dialog for editing `deposit_returned_amount` (and optionally `note`) on an
 * already-RETURNED rental. Follows the same pattern as `PaymentEditDialog`:
 * uses the custom `POST /api/rentals/{id}/update-return` endpoint via
 * `data/rentals.repo.ts#updateReturnDetails` (the collection's `updateRule`
 * blocks setting `deposit_returned_amount` directly through a generic PATCH).
 *
 * Footer: Cancelar + Guardar. No destructive delete action here — a returned
 * rental's existence itself isn't being questioned, only its deposit amount
 * (a common correction after a rounding or miscommunication at handoff time).
 *
 * On success: calls `onUpdated(updatedRental)` and closes the dialog.
 */

export interface ReturnEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string;
  folio: string;
  currentDepositReturned: number;
  currentNote?: string;
  onUpdated: (rental: RentalRecord) => void;
}

export function ReturnEditDialog({
  open,
  onOpenChange,
  rentalId,
  folio,
  currentDepositReturned,
  currentNote = "",
  onUpdated,
}: ReturnEditDialogProps) {
  const [depositReturned, setDepositReturned] = useState(
    String(currentDepositReturned),
  );
  const [note, setNote] = useState(currentNote);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset fields when dialog opens for a new rental or re-opens.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevRentalId, setPrevRentalId] = useState(rentalId);

  if (open && (!prevOpen || rentalId !== prevRentalId)) {
    setPrevOpen(true);
    setPrevRentalId(rentalId);
    setDepositReturned(String(currentDepositReturned));
    setNote(currentNote || "");
    setFormError(null);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  async function handleSave() {
    setFormError(null);

    const parsed = Number(depositReturned || "0");
    if (isNaN(parsed) || parsed < 0) {
      setFormError("El depósito devuelto no puede ser negativo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateReturnDetails(rentalId, {
        depositReturnedAmount: parsed,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success("Devolución actualizada correctamente");
      onOpenChange(false);
      onUpdated(updated);
    } catch (error) {
      if (handleIfStaleSession(error)) {
        return;
      }
      setFormError("No se pudo actualizar la devolución. Intenta de nuevo.");
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
              Editar devolución{" "}
              <span className="text-muted-foreground font-normal text-base">
                {folio}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-edit-deposit">Depósito devuelto</Label>
              <CurrencyInput
                id="return-edit-deposit"
                placeholder="$ 0"
                value={depositReturned}
                onChange={setDepositReturned}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-edit-note">Nota (opcional)</Label>
              <textarea
                id="return-edit-note"
                className="border-input placeholder:text-muted-foreground/45 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Observaciones o comentarios"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
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

      <LoadingDialog
        open={isSubmitting}
        manageHistory={false}
        title="Guardando cambios..."
        description="Estamos actualizando los detalles de la devolución."
      />
    </>
  );
}
