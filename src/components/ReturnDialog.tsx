import { useState } from "react";
import { Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CustomerCard } from "@/components/CustomerCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingDialog } from "@/components/LoadingDialog";
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
import { formatDateDisplay } from "@/lib/formatDate";

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
 *
 * design-fidelity (Slice B1, obs #2221/#2223/#2224, call site #1): "Confirmar
 * devolución" is now a TRIGGER that opens a shared `ConfirmDialog`, not the
 * mutation itself — devolver is one-way and server-enforced (blocks all
 * future payments on the rental), so it gates unconditionally, regardless
 * of pending balance. `ConfirmDialog` renders as a JSX SIBLING of this
 * outer container (design B3 nesting pattern) so cancelling keeps it
 * mounted with the typed amounts intact.
 *
 * design-fidelity post-audit structural fix (pencil frame "Devolver renta ·
 * Con monto", owner-confirmed after live screenshots): the outer container
 * is a `Sheet` (bottom sheet), NOT a `Dialog` — every other real design
 * frame for this flow shows it sliding up from the bottom, matching
 * `RentalDetailSheet`/`CustomerDetailSheet`'s own contextual-view pattern.
 * Only this outer container changed type; the nested "Confirmar devolución"
 * `ConfirmDialog` stays a modal (unchanged, per B3/B4 #1 — it's a real
 * "are you sure" gate, not a contextual view). Folio moves into the sheet
 * header as a trailing badge (frame convention: title left, folio pill
 * right). Customer identity is now a `CustomerCard` (name/avatar/phone),
 * replacing the old plain "Cliente" `dl` row. The read-only context rows
 * live inside a white "Resumen" card (`bg-card border`, NOT the gray
 * `bg-muted` card `RentalCreatedSummary` uses — the frame's card is
 * white). "Nota (opcional)" is a `<textarea>` (the frame's box is
 * multi-line-tall), and "Total a entregar"'s amount is `text-primary`
 * (same blue-for-money convention as `RentalCard`'s `amount` prop). No
 * divider between the sheet title and its content, and no `X` close
 * button — bottom sheets in this app are exclusive, dismissed only via
 * their own action buttons (swipe-to-dismiss/backdrop tap still work via
 * `Sheet`'s own Vaul-backed defaults, same as every other sheet).
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
  const [confirmOpen, setConfirmOpen] = useState(false);

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
          note: parsed.data.note ? parsed.data.note : undefined,
        }),
      );
      // §16.13/§17 (gap-fill finding 4) originally added a toast here for
      // an explicit visual confirmation — since superseded by
      // `ReturnCreatedSummary` (design-fidelity), which now shows that same
      // "Devolución registrada" confirmation as its own dialog right after
      // this one closes. Keeping both showed the message twice.
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
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent showCloseButton={false} className="bg-background">
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b-0 pr-4">
            <SheetTitle>Devolver renta</SheetTitle>
            <span className="bg-primary-soft text-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">
              {folio}
            </span>
          </SheetHeader>

          <CustomerCard name={customerName} phone={customerPhone} />

          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Receipt aria-hidden="true" className="text-primary size-4" />
              Resumen
            </h2>
            <dl className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Producto(s)</dt>
                <dd className="text-right font-semibold text-foreground">
                  {items
                    .map(
                      (item) => `${item.quantity} x ${rentalItemTypeLabel(item.itemType)}`,
                    )
                    .join(", ")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fecha de inicio</dt>
                <dd className="font-semibold text-foreground">{formatDateDisplay(startedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tiempo transcurrido</dt>
                <dd className="font-semibold text-foreground">{elapsedDays} días</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Depósito</dt>
                <dd className="font-semibold text-foreground">{formatCurrencyMXN(depositAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Renta inicial</dt>
                <dd className="font-semibold text-foreground">{formatCurrencyMXN(initialRentAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total pagado en rentas</dt>
                <dd className="font-semibold text-foreground">{formatCurrencyMXN(totalRentPaid)}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-4 border-t pt-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wallet aria-hidden="true" className="text-primary size-4" />
              Devolución
            </h2>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-amount-collected">Monto cobrado</Label>
              {hasPreviousRentPayment ? (
                <p className="text-muted-foreground text-sm">
                  Renta acordada: {formatCurrencyMXN(initialRentAmount)} ·
                  Último pago: {formatCurrencyMXN(suggestedAmount)}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Renta: {formatCurrencyMXN(initialRentAmount)}
                </p>
              )}
              <CurrencyInput
                id="return-amount-collected"
                placeholder={formatCurrencyMXN(hasPreviousRentPayment ? suggestedAmount : initialRentAmount)}
                value={amountCollected}
                onChange={setAmountCollected}
              />
            </div>

            {hasDeposit && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="return-deposit-returned">
                  Depósito a devolver
                </Label>
                <CurrencyInput
                  id="return-deposit-returned"
                  placeholder={formatCurrencyMXN(depositAmount)}
                  value={depositReturned}
                  onChange={setDepositReturned}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="return-note">Nota (opcional)</Label>
              {/* design-fidelity structural fix (pencil frame "Devolver
                  renta"): a multi-line `<textarea>`, not a single-line
                  `Input` — the frame's box is visibly taller than the
                  amount fields above it. */}
              <textarea
                id="return-note"
                placeholder="Observaciones sobre la devolución"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="border-input placeholder:text-muted-foreground/45 focus-visible:border-ring focus-visible:ring-ring/50 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base outline-none transition-[color,box-shadow] shadow-xs focus-visible:ring-[3px]"
              />
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </section>

          <SheetFooter className="bg-background border-t px-4 pt-3 pb-6 mt-auto flex-col items-stretch">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total a entregar</span>
              <span className="text-primary font-bold text-base">
                {formatCurrencyMXN(totalToHandBack)}
              </span>
            </div>

            <Button
              type="button"
              size="lg"
              disabled={isSubmitting}
              onClick={() => setConfirmOpen(true)}
              className="w-full"
            >
              Confirmar devolución
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Devolver esta renta?"
        description={`La renta ${folio} se marcará como devuelta. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, devolver"
        onConfirm={() => {
          // Pencil ground truth ("Carga · Procesando devolución"): the
          // actual submit uses the separate, button-less LoadingDialog
          // below, not this ConfirmDialog's own (button-based) loading
          // state — so this popup closes immediately on confirm instead of
          // staying open with disabled buttons for the mutation's duration.
          setConfirmOpen(false);
          void handleConfirm();
        }}
      />

      <LoadingDialog
        open={isSubmitting}
        // Opens in the same commit that ConfirmDialog's "Sí, devolver"
        // closes it (setConfirmOpen(false) + setIsSubmitting(true) are
        // batched into one commit) — see LoadingDialog's own manageHistory
        // doc for why this must opt out.
        manageHistory={false}
        title="Procesando devolución..."
        description="Estamos devolviendo la renta y calculando el depósito."
      />
    </>
  );
}
