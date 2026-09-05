import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { handleIfStaleSession } from "@/data/staleSession";
import { daysSince } from "@/domain/rentals/dashboard";
import {
  buildReturnReceipt,
  type ReceiptItemLine,
  type ReturnReceiptData,
} from "@/domain/rentals/receipt";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import { returnFormSchema } from "@/domain/rentals/return";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §7.3 (flujo Devolución) + §16.8 + §16.10 (acción "Devolver" sobre
 * Detalle de renta) + CU6. Task 3.2 — wired onto `RentalDetailSheet`'s
 * "Devolver" button (task 3.3/3.5), never inside a menu (§16.2/§17).
 * `rentals.status` never changes client-side directly — this always calls
 * `data/rentals.repo.ts#returnRental`, the thin wrapper over the custom
 * `POST /api/rentals/{id}/return` endpoint (§19.1, task 3.1).
 *
 * Redesign Round 3, Batch B (visual consistency): the per-item `dl` rows
 * collapsed into one "Producto(s)" line (same `.join(", ")` convention
 * `RentalCreatedSummary` already uses) and the editable fields moved into
 * their own `border-t pt-4` block, separating "contexto de solo lectura"
 * from "lo que vas a registrar" — same section-break pattern
 * `RentalDetailSheet` already established. No field was removed, only
 * regrouped. Footer uses the same `flex-col items-stretch` fix as
 * `RentalCreatedSummary`/`ReturnCreatedSummary` (keeps the confirm button
 * full-width on tablet instead of shrinking to `sm:justify-end`).
 *
 * Post-launch UX fix: the read-only context block now also shows "Renta
 * inicial" and "Total pagado en rentas" — before this, someone processing a
 * return only saw "Depósito" plus a bare "Sugerido: $X" line that lost all
 * reference to the originally agreed rent once payments had drifted from it
 * (e.g. informal discounts over time). "Monto cobrado"'s helper text mirrors
 * `PaymentSuggestionField`'s exact two-line wording ("Renta acordada" /
 * "Último pago") for consistency between the two places a rent amount gets
 * confirmed.
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
  initialRentAmount: number;
  totalRentPaid: number;
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
  initialRentAmount,
  totalRentPaid,
  hasPreviousRentPayment,
  onReturned,
}: ReturnDialogProps) {
  // Redesign — UX/UI pass: both start empty (placeholders show the
  // suggestion instead) so a rushed confirm can never silently accept a
  // stale/wrong prefilled number — same reasoning as PaymentDialog/
  // PaymentSuggestionField.
  const [amountCollected, setAmountCollected] = useState("");
  const [depositReturned, setDepositReturned] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  const hasDeposit = depositAmount > 0;

  // Same "adjust state during render" pattern PaymentDialog uses (task
  // 2.4) instead of a useEffect, to re-seed the form every time the dialog
  // opens fresh, possibly for a different rental.
  if (open && !wasOpen) {
    setWasOpen(true);
    setAmountCollected("");
    setDepositReturned("");
    setNote("");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // §7.3's "total a entregar" (business-owner request, post-launch audit):
  // the actual deposit-return input only exists when there's a deposit to
  // give back (see the conditional render below) — when there isn't,
  // nothing is returned on that front regardless of `depositReturned`'s
  // stale/empty state.
  const totalToHandBack = hasDeposit ? Number(depositReturned || 0) : 0;

  const elapsedDays = daysSince(startedAt);

  async function handleConfirm() {
    setFormError(null);

    const parsed = returnFormSchema.safeParse({
      amount_collected: Number(amountCollected || 0),
      deposit_returned: hasDeposit ? Number(depositReturned || 0) : 0,
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
      // §16.13/§17 (gap-fill finding 4): §16.13 explicitly lists
      // devolución as a state needing its own explicit visual
      // confirmation — this dialog closes into the Comprobante modal, but
      // gave zero acknowledgment before it, same silent-success gap
      // PaymentDialog had.
      toast.success("Devolución registrada.");
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
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Producto(s)</dt>
            <dd className="text-right">
              {items
                .map(
                  (item) => `${item.quantity} x ${rentalItemTypeLabel(item.itemType)}`,
                )
                .join(", ")}
            </dd>
          </div>
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
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Renta inicial</dt>
            <dd>{formatCurrencyMXN(initialRentAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total pagado en rentas</dt>
            <dd>{formatCurrencyMXN(totalRentPaid)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-4 border-t pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="return-amount-collected">Monto cobrado</Label>
            {hasPreviousRentPayment ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Renta acordada: {formatCurrencyMXN(initialRentAmount)}
                </p>
                <p className="text-muted-foreground text-sm">
                  Último pago: {formatCurrencyMXN(suggestedAmount)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Renta: {formatCurrencyMXN(initialRentAmount)}
              </p>
            )}
            <CurrencyInput
              id="return-amount-collected"
              placeholder="$ 0"
              value={amountCollected}
              onChange={setAmountCollected}
            />
          </div>

          {/* §7.3 (business-owner finding, post-launch audit): a rental with
              no deposit has nothing to give back — showing this field anyway
              invites confusion (and a stray non-zero "devolución" for money
              that was never collected). Renta/monto cobrado above always
              stays, deposit is the only conditional part. */}
          {hasDeposit && (
            <div className="flex flex-col gap-1.5">
              {/* Business-owner finding: `suggestedDepositReturn` always
                  equals `depositAmount` (see its own docblock) — a
                  "Sugerido: $X" line here would just repeat the read-only
                  "Depósito" row shown a few lines above, verbatim, every
                  single time. Removed. Post-launch UX pass: the placeholder
                  no longer carries the suggested number either (now a
                  static "$ 0", matching "Monto cobrado") — the read-only
                  "Depósito" row above is the only remaining reference for
                  this amount. */}
              <Label htmlFor="return-deposit-returned">
                Depósito a devolver
              </Label>
              <CurrencyInput
                id="return-deposit-returned"
                placeholder="$ 0"
                value={depositReturned}
                onChange={setDepositReturned}
              />
            </div>
          )}

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
        </div>

        <div className="sticky -bottom-4 -mx-4 -mb-4 mt-auto z-20 flex flex-col gap-3 bg-background px-4 pb-4 pt-3 border-t">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total a entregar</span>
            <span>{formatCurrencyMXN(totalToHandBack)}</span>
          </div>

          <DialogFooter className="flex-col items-stretch">
            <Button
              type="button"
              size="lg"
              disabled={isSubmitting}
              onClick={() => void handleConfirm()}
              className="w-full"
            >
              {isSubmitting ? "Guardando…" : "Confirmar devolución"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
