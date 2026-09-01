import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Landmark, PiggyBank, Printer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PaymentDialog } from "@/components/PaymentDialog";
import { ReturnDialog } from "@/components/ReturnDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { ReturnCreatedSummary } from "@/components/ReturnCreatedSummary";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import {
  getRental,
  listItemsForRental,
  type PaymentType,
  type PaymentWithUser,
  type RentalItemRecord,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import { listPaymentsForRental } from "@/data/payments.repo";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import {
  paymentTypeLabel,
  suggestedPaymentAmount,
  totalPaid,
} from "@/domain/payments/payment";
import {
  buildRentalReceipt,
  type ReturnReceiptData,
} from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";

// Redesign — UX/UI pass: one distinct icon per `payment_type`, so the
// history timeline is scannable at a glance instead of relying on the text
// label alone.
const PAYMENT_TYPE_ICONS: Record<PaymentType, typeof PiggyBank> = {
  deposit: PiggyBank,
  rent: Landmark,
  adjustment: Wrench,
};

/**
 * SDD.md §16.10 (Detalle de renta — prioridad de información) + §16.5/§16.6
 * (vista contextual, `Sheet`, no ruta propia) + §18. Task 3.3.
 *
 * Always reloads the rental fresh by id (task 3.1's `getRental`) rather
 * than trusting whatever stale card/row opened it — a rental returned in
 * this same session must show its new status without a full page reload.
 *
 * Redesign Round 3, punto 2: reorganizado en 4 bloques (Encabezado /
 * Resumen / Próximo-último pago / Historial de pagos) en vez de un `<dl>`
 * plano. El historial de pagos ahora renderiza CADA pago individual —
 * monto, tipo, fecha/hora, quién lo registró y su nota — no solo un total.
 * La "sugerencia de mensualidad" reusa `suggestedPaymentAmount` (la misma
 * fórmula que ya usa `PaymentDialog`/`PaymentSuggestionField`) y se marca
 * explícitamente como sugerencia, nunca como un monto obligatorio.
 *
 * Redesign Round 3, punto 5: devolver ya no abre el comprobante completo de
 * inmediato — muestra `ReturnCreatedSummary` (confirmación breve) primero;
 * el comprobante completo sigue disponible vía "Ver comprobante".
 */

export interface RentalDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string | null;
  onViewCustomer?: (customerId: string) => void;
}

export function RentalDetailSheet({
  open,
  onOpenChange,
  rentalId,
  onViewCustomer,
}: RentalDetailSheetProps) {
  const navigate = useNavigate();

  const [rental, setRental] = useState<RentalWithCustomer | null>(null);
  const [items, setItems] = useState<RentalItemRecord[]>([]);
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnSummaryOpen, setReturnSummaryOpen] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState<ReturnReceiptData | null>(
    null,
  );
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Redesign — UX/UI pass: per-row reprint on the "Depósito inicial" history
  // entry — reuses the exact receipt this rental was created with
  // (`buildRentalReceipt`), reconstructed from data already in this sheet's
  // own state (no new fetch). "Mensualidad"/"Ajuste" rows don't get a
  // reprint action here: `domain/rentals/receipt.ts` has no receipt
  // template for a standalone rent/adjustment payment (only "create" and
  // "return") — building one is a separate, bigger feature (new receipt
  // kind + ESC/POS layout + tests), out of scope for this pass.
  const [creationReceiptOpen, setCreationReceiptOpen] = useState(false);

  // Pure fetch, no setState inside — kept separate from the effect/reload
  // callers below on purpose. `react-hooks/set-state-in-effect` flags any
  // component-scope function that (even indirectly, via a later .then())
  // ends up calling setState when it's invoked directly from an effect
  // body; keeping this fetch state-free and letting each caller assign the
  // results itself avoids that false positive while still deduplicating
  // the three parallel requests.
  function fetchRentalDetail(id: string) {
    return Promise.all([
      getRental(id),
      listItemsForRental(id),
      listPaymentsForRental(id),
    ]);
  }

  useEffect(() => {
    if (!open || !rentalId) {
      return;
    }

    let cancelled = false;

    fetchRentalDetail(rentalId)
      .then(([rentalResult, itemsResult, paymentsResult]) => {
        if (!cancelled) {
          setError(null);
          setRental(rentalResult);
          setItems(itemsResult);
          setPayments(paymentsResult);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudo cargar la renta.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, rentalId]);

  function reload() {
    if (!rentalId) {
      return;
    }

    fetchRentalDetail(rentalId)
      .then(([rentalResult, , paymentsResult]) => {
        setError(null);
        setRental(rentalResult);
        setPayments(paymentsResult);
      })
      .catch(() => {
        setError(
          "No se pudo actualizar la renta. Verifica tu conexión e intenta de nuevo.",
        );
      });
  }

  // `listPaymentsForRental` sorts newest first, so the first `rent` payment
  // found is the last one — no separate query needed here.
  const lastRentPayment =
    payments.find((payment) => payment.payment_type === "rent") ?? null;
  const suggestedAmount = suggestedPaymentAmount(
    lastRentPayment?.amount ?? null,
    rental?.initial_rent_amount ?? 0,
  );
  const total = totalPaid(payments.map((payment) => payment.amount));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          {error && <p className="text-destructive text-sm">{error}</p>}

          {!rental && !error && (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          )}

          {rental && (
            <>
              {/* A. Encabezado */}
              <SheetHeader>
                <SheetTitle>Renta {rental.folio}</SheetTitle>
              </SheetHeader>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {rental.expand?.customer_id?.name ?? "—"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {rental.expand?.customer_id?.phone ?? "—"}
                  </p>
                </div>
                <RentalStatusBadge status={rental.status} />
              </div>

              {/* B. Resumen */}
              <section className="flex flex-col gap-2 border-t pt-4">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Resumen
                </h2>
                <dl className="flex flex-col gap-2 text-sm">
                  {items.map((item) => (
                    <div className="flex justify-between" key={item.id}>
                      <dt className="text-muted-foreground">
                        {rentalItemTypeLabel(item.item_type)}
                      </dt>
                      <dd>x{item.quantity}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Fecha de inicio</dt>
                    <dd>
                      {new Date(rental.created).toLocaleDateString("es-MX")}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Renta</dt>
                    <dd>{formatCurrencyMXN(rental.initial_rent_amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Depósito</dt>
                    <dd>{formatCurrencyMXN(rental.deposit_amount)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Total pagado</dt>
                    <dd>{formatCurrencyMXN(total)}</dd>
                  </div>
                </dl>
              </section>

              {/* C. Historial de pagos */}
              <section className="flex flex-col gap-2 border-t pt-4">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Historial de pagos
                </h2>
                {payments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Sin pagos registrados.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {/* `payments` comes from `listPaymentsForRental` sorted
                        newest-first (see that function's own docblock —
                        `lastRentPayment` above depends on that order and is
                        NOT touched here). Reversed only for this display:
                        the business owner wants the oldest event (Depósito
                        inicial) first, most recent last. */}
                    {[...payments].reverse().map((payment) => {
                      const Icon = PAYMENT_TYPE_ICONS[payment.payment_type];
                      return (
                        <li
                          key={payment.id}
                          className="flex items-start gap-2 border-l-2 pl-3"
                        >
                          <Icon
                            aria-hidden="true"
                            className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          />
                          <div className="flex-1">
                            <p className="font-medium">
                              {formatCurrencyMXN(payment.amount)}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {paymentTypeLabel(payment.payment_type)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatPaymentDateTime(payment.created)}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Registró:{" "}
                              {payment.expand?.created_by?.name ?? "—"}
                            </p>
                            {payment.note && (
                              <p className="text-muted-foreground text-xs italic">
                                {payment.note}
                              </p>
                            )}
                          </div>
                          {payment.payment_type === "deposit" && (
                            <button
                              type="button"
                              aria-label="Reimprimir comprobante de depósito inicial"
                              onClick={() => setCreationReceiptOpen(true)}
                              className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                            >
                              <Printer aria-hidden="true" className="size-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}

          {rental && (rental.status === "ACTIVE" || onViewCustomer) && (
            <SheetFooter>
              {rental.status === "ACTIVE" && (
                <>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => setPaymentDialogOpen(true)}
                  >
                    Registrar pago
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => setReturnDialogOpen(true)}
                  >
                    Devolver
                  </Button>
                </>
              )}

              {onViewCustomer && (
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  onClick={() => onViewCustomer(rental.customer_id)}
                >
                  Ver ficha de cliente
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {rental && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          rentalId={rental.id}
          suggestedAmount={suggestedAmount}
          hasPreviousRentPayment={!!lastRentPayment}
          onRegistered={() => {
            setPaymentDialogOpen(false);
            reload();
          }}
        />
      )}

      {rental && (
        <ReturnDialog
          open={returnDialogOpen}
          onOpenChange={setReturnDialogOpen}
          rentalId={rental.id}
          businessName={import.meta.env.VITE_BUSINESS_NAME}
          businessPhone={import.meta.env.VITE_BUSINESS_PHONE}
          folio={rental.folio}
          customerName={rental.expand?.customer_id?.name ?? ""}
          customerPhone={rental.expand?.customer_id?.phone ?? ""}
          items={items.map((item) => ({
            itemType: item.item_type,
            quantity: item.quantity,
          }))}
          startedAt={new Date(rental.created)}
          depositAmount={rental.deposit_amount}
          suggestedAmount={suggestedAmount}
          hasPreviousRentPayment={!!lastRentPayment}
          onReturned={(receipt) => {
            setReturnReceipt(receipt);
            setReturnSummaryOpen(true);
            reload();
          }}
        />
      )}

      <ReturnCreatedSummary
        open={returnSummaryOpen}
        onOpenChange={setReturnSummaryOpen}
        receipt={returnReceipt}
        onViewReceipt={() => {
          setReturnSummaryOpen(false);
          setReceiptOpen(true);
        }}
        onGoHome={() => {
          setReturnSummaryOpen(false);
          onOpenChange(false);
          navigate("/dashboard");
        }}
      />

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        receipt={returnReceipt}
      />

      {rental && (
        <ReceiptDialog
          open={creationReceiptOpen}
          onOpenChange={setCreationReceiptOpen}
          receipt={buildRentalReceipt({
            businessName: import.meta.env.VITE_BUSINESS_NAME,
            businessPhone: import.meta.env.VITE_BUSINESS_PHONE,
            folio: rental.folio,
            date: new Date(rental.created),
            customerName: rental.expand?.customer_id?.name ?? "",
            customerPhone: rental.expand?.customer_id?.phone ?? "",
            items: items.map((item) => ({
              itemType: item.item_type,
              quantity: item.quantity,
            })),
            initialRentAmount: rental.initial_rent_amount,
            depositAmount: rental.deposit_amount,
            extras: rental.extras ?? [],
          })}
          autoPrint={false}
        />
      )}
    </>
  );
}

// §16.10-adjacent: plain-text date+time formatting for the payment history
// timeline — no library, matches the rest of this file's `toLocaleDateString`
// usage but adds a time component ("29 ago 2026 · 2:41 PM").
function formatPaymentDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}
