import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PaymentDialog } from "@/components/PaymentDialog";
import { ReturnDialog } from "@/components/ReturnDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import {
  getRental,
  listItemsForRental,
  type PaymentRecord,
  type RentalItemRecord,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import { listPaymentsForRental } from "@/data/payments.repo";
import { rentalItemTypeLabel } from "@/domain/rentals/rental";
import { suggestedPaymentAmount, totalPaid } from "@/domain/payments/payment";
import type { ReceiptData } from "@/domain/rentals/receipt";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §16.10 (Detalle de renta — prioridad de información) + §16.5/§16.6
 * (vista contextual, `Sheet`, no ruta propia) + §18. Task 3.3.
 *
 * Order matches §16.10 exactly: folio, cliente, teléfono, qué tiene
 * rentado, renta, depósito, fecha de inicio, último pago, total pagado,
 * estado. "Registrar pago" and "Devolver" are always visible buttons
 * (§16.2/§17 — never inside a `DropdownMenu`), shown only while the
 * rental is `ACTIVE` (§19 — `RETURNED` is a terminal state).
 *
 * Always reloads the rental fresh by id (task 3.1's `getRental`) rather
 * than trusting whatever stale card/row opened it — a rental returned in
 * this same session must show its new status without a full page reload.
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
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

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

    fetchRentalDetail(rentalId).then(([rentalResult, , paymentsResult]) => {
      setRental(rentalResult);
      setPayments(paymentsResult);
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
              <SheetHeader>
                <SheetTitle>Renta {rental.folio}</SheetTitle>
              </SheetHeader>

              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd>{rental.expand?.customer_id?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Teléfono</dt>
                  <dd>{rental.expand?.customer_id?.phone ?? "—"}</dd>
                </div>
                {items.map((item) => (
                  <div className="flex justify-between" key={item.id}>
                    <dt className="text-muted-foreground">
                      {rentalItemTypeLabel(item.item_type)}
                    </dt>
                    <dd>x{item.quantity}</dd>
                  </div>
                ))}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Renta</dt>
                  <dd>{formatCurrencyMXN(rental.initial_rent_amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Depósito</dt>
                  <dd>{formatCurrencyMXN(rental.deposit_amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Fecha de inicio</dt>
                  <dd>
                    {new Date(rental.created).toLocaleDateString("es-MX")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Último pago</dt>
                  <dd>
                    {lastRentPayment
                      ? formatCurrencyMXN(lastRentPayment.amount)
                      : "Sin pagos"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total pagado</dt>
                  <dd>{formatCurrencyMXN(total)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd>
                    <RentalStatusBadge status={rental.status} />
                  </dd>
                </div>
              </dl>

              {rental.status === "ACTIVE" && (
                <div className="flex flex-col gap-2">
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
                </div>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={() => onViewCustomer?.(rental.customer_id)}
              >
                Ver ficha de cliente
              </Button>
            </>
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
          onReturned={(returnReceipt) => {
            setReceipt(returnReceipt);
            setReceiptOpen(true);
            reload();
          }}
        />
      )}

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={(next) => {
          setReceiptOpen(next);
          // §18: "modal Comprobante de devolución → cerrar → Dashboard" —
          // closing the devolución receipt always lands on Dashboard,
          // regardless of whether this Sheet was opened from Dashboard or
          // Buscar.
          if (!next) {
            onOpenChange(false);
            navigate("/dashboard");
          }
        }}
        receipt={receipt}
      />
    </>
  );
}
