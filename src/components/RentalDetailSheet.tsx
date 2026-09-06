import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Landmark, PiggyBank, Printer, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerCard } from "@/components/CustomerCard";
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
  buildPaymentReceipt,
  buildRentalReceipt,
  type PaymentReceiptData,
  type ReturnReceiptData,
} from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";
import { cn } from "@/lib/utils";

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
 * inmediato — muestra `ReturnCreatedSummary` (confirmación breve) primero,
 * con sus propias acciones de imprimir/compartir inline (post-launch
 * polish — ya no hay un "Ver comprobante" separado, ver ese componente).
 *
 * design-fidelity post-audit bugfix batch (Fix 5, pencil frame `Modal
 * Renta`, rows `g6Fxm`/`BqSjN`/`c9xLbb`): payment-history rows restyled to
 * a horizontal layout — colored circular icon badge (deposit: `--primary-
 * soft` fill; mensualidad/ajuste: `--success-soft` fill; icon stays
 * `text-primary` in both, per the exact live-design color extraction) →
 * Concepto+Fecha stacked → Monto → trailing reprint icon. Dropped the old
 * `border-l-2` left-border rule and plain gray icon. `Registró: {name}` is
 * an app-only feature with NO pencil-design equivalent, kept per explicit
 * owner decision (design obs #2224, "Explicitly OUT of scope") — it moves
 * to a smaller secondary line under Concepto/Fecha, unchanged in content.
 */

export interface RentalDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalId: string | null;
  onViewCustomer?: (customerId: string) => void;
  onRentalChanged?: () => void;
}

export function RentalDetailSheet({
  open,
  onOpenChange,
  rentalId,
  onViewCustomer,
  onRentalChanged,
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

  // Redesign — UX/UI pass: per-row reprint on the "Depósito inicial" history
  // entry — reuses the exact receipt this rental was created with
  // (`buildRentalReceipt`), reconstructed from data already in this sheet's
  // own state (no new fetch).
  const [creationReceiptOpen, setCreationReceiptOpen] = useState(false);

  // Post-launch polish: every OTHER payment-history row ("Mensualidad"/
  // "Ajuste") is reprintable too now, not just "Depósito inicial" — via the
  // new `"payment"` receipt kind (`domain/rentals/receipt.ts`). One shared
  // dialog + one selected-payment slot, since only one row's reprint can be
  // open at a time.
  const [paymentReceiptOpen, setPaymentReceiptOpen] = useState(false);
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] =
    useState<PaymentReceiptData | null>(null);

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
              <SheetHeader className="flex flex-row items-center justify-between gap-2">
                <SheetTitle>Renta {rental.folio}</SheetTitle>
                <RentalStatusBadge status={rental.status} />
              </SheetHeader>

              {onViewCustomer && rental.customer_id ? (
                <CustomerCard
                  name={rental.expand?.customer_id?.name ?? "—"}
                  phone={rental.expand?.customer_id?.phone}
                  ariaLabel="Ver ficha de cliente"
                  onClick={() => onViewCustomer(rental.customer_id)}
                />
              ) : (
                <CustomerCard
                  name={rental.expand?.customer_id?.name ?? "—"}
                  phone={rental.expand?.customer_id?.phone}
                />
              )}

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
                      const isDeposit = payment.payment_type === "deposit";
                      return (
                        <li
                          key={payment.id}
                          className="flex items-center gap-3"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-10 shrink-0 items-center justify-center rounded-full",
                              isDeposit ? "bg-primary-soft" : "bg-success-soft",
                            )}
                          >
                            <Icon className="text-primary size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
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
                          <p className="shrink-0 font-medium">
                            {formatCurrencyMXN(payment.amount)}
                          </p>
                          <button
                            type="button"
                            aria-label={`Reimprimir comprobante de ${paymentTypeLabel(payment.payment_type).toLowerCase()}`}
                            onClick={() => {
                              if (payment.payment_type === "deposit") {
                                setCreationReceiptOpen(true);
                                return;
                              }

                              setSelectedPaymentReceipt(
                                buildPaymentReceipt({
                                  businessName: import.meta.env.VITE_BUSINESS_NAME,
                                  businessPhone: import.meta.env.VITE_BUSINESS_PHONE,
                                  folio: rental?.folio ?? "",
                                  customerName:
                                    rental?.expand?.customer_id?.name ?? "",
                                  customerPhone:
                                    rental?.expand?.customer_id?.phone ?? "",
                                  paymentType: payment.payment_type,
                                  amount: payment.amount,
                                  date: new Date(payment.created),
                                  note: payment.note || undefined,
                                }),
                              );
                              setPaymentReceiptOpen(true);
                            }}
                            className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                          >
                            <Printer aria-hidden="true" className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}

          {rental && rental.status === "ACTIVE" && (
            <SheetFooter>
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
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {rental && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          rentalId={rental.id}
          folio={rental.folio}
          suggestedAmount={suggestedAmount}
          initialRentAmount={rental.initial_rent_amount}
          hasPreviousRentPayment={!!lastRentPayment}
          onRegistered={() => {
            setPaymentDialogOpen(false);
            reload();
            onRentalChanged?.();
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
          initialRentAmount={rental.initial_rent_amount}
          totalRentPaid={payments
            .filter((payment) => payment.payment_type === "rent")
            .reduce((sum, payment) => sum + payment.amount, 0)}
          hasPreviousRentPayment={!!lastRentPayment}
          onReturned={(receipt) => {
            setReturnReceipt(receipt);
            setReturnSummaryOpen(true);
            reload();
            onRentalChanged?.();
          }}
        />
      )}

      <ReturnCreatedSummary
        open={returnSummaryOpen}
        onOpenChange={setReturnSummaryOpen}
        receipt={returnReceipt}
        onGoHome={() => {
          setReturnSummaryOpen(false);
          onOpenChange(false);
          navigate("/dashboard");
        }}
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
          })}
          autoPrint={false}
        />
      )}

      <ReceiptDialog
        open={paymentReceiptOpen}
        onOpenChange={setPaymentReceiptOpen}
        receipt={selectedPaymentReceipt}
        autoPrint={false}
      />
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
