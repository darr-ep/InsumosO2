import { useContext, useEffect, useState } from "react";
import {
  History,
  Landmark,
  MessageSquare,
  Pencil,
  PiggyBank,
  Printer,
  Receipt,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomerCard } from "@/components/CustomerCard";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaymentDialog } from "@/components/PaymentDialog";
import { PaymentEditDialog } from "@/components/PaymentEditDialog";
import { RentalEditForm } from "@/components/RentalEditForm";
import { ReturnDialog } from "@/components/ReturnDialog";
import { ReturnEditDialog } from "@/components/ReturnEditDialog";
import { ReceiptDialog } from "@/components/ReceiptDialog";
import { ReturnCreatedSummary } from "@/components/ReturnCreatedSummary";
import { PaymentCreatedSummary } from "@/components/PaymentCreatedSummary";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { pb } from "@/data/pocketbaseClient";
import { DataCacheContext } from "@/app/DataCacheContext";
import {
  deleteRental,
  getRental,
  listItemsForRental,
  updateRental,
  type PaymentType,
  type PaymentWithUser,
  type RentalItemRecord,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import { listPaymentsForRental } from "@/data/payments.repo";
import { rentalItemTypeLabel, type RentalItemType } from "@/domain/rentals/rental";
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
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/formatDate";
import { cn } from "@/lib/utils";

// Redesign — UX/UI pass: one distinct icon per `payment_type`, so the
// history timeline is scannable at a glance instead of relying on the text
// label alone.
const PAYMENT_TYPE_ICONS: Record<PaymentType, typeof PiggyBank> = {
  deposit: PiggyBank,
  rent: Landmark,
  adjustment: Wrench,
};

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
  const cache = useContext(DataCacheContext);
  const [rental, setRental] = useState<RentalWithCustomer | null>(null);
  const [items, setItems] = useState<RentalItemRecord[]>([]);
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingRental, setIsSavingRental] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentEditDialogOpen, setPaymentEditDialogOpen] = useState(false);
  const [selectedPaymentForEdit, setSelectedPaymentForEdit] =
    useState<PaymentWithUser | null>(null);

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnSummaryOpen, setReturnSummaryOpen] = useState(false);
  const [returnReceipt, setReturnReceipt] = useState<ReturnReceiptData | null>(
    null,
  );
  const [returnEditDialogOpen, setReturnEditDialogOpen] = useState(false);

  const [paymentSummaryOpen, setPaymentSummaryOpen] = useState(false);
  const [paymentCreatedReceipt, setPaymentCreatedReceipt] =
    useState<PaymentReceiptData | null>(null);

  const [creationReceiptOpen, setCreationReceiptOpen] = useState(false);

  const [paymentReceiptOpen, setPaymentReceiptOpen] = useState(false);
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] =
    useState<PaymentReceiptData | null>(null);

  function fetchRentalDetail(id: string) {
    return Promise.all([
      getRental(id),
      listItemsForRental(id),
      listPaymentsForRental(id),
    ]);
  }

  useEffect(() => {
    if (!open || !rentalId) {
      setRental(null);
      setItems([]);
      setPayments([]);
      setIsEditing(false);
      setEditError(null);
      return;
    }

    setRental(null);
    setItems([]);
    setPayments([]);
    setIsEditing(false);
    setEditError(null);
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
      .catch((err: unknown) => {
        if (!cancelled) {
          const is404 = (err as { status?: number })?.status === 404;
          if (is404) {
            onOpenChange(false);
            return;
          }
          setError("No se pudo cargar la renta.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, rentalId]);

  useEffect(() => {
    if (!open || !rentalId) return;

    const hasEventSource = typeof EventSource !== "undefined";
    if (!hasEventSource || !pb?.collection) return;

    const handleRealtimeUpdate = (e: { record?: { rental_id?: string; id?: string } }) => {
      if (e?.record?.id === rentalId || e?.record?.rental_id === rentalId) {
        reload();
      }
    };

    pb.collection("rentals").subscribe(rentalId, handleRealtimeUpdate).catch(() => {});
    pb.collection("payments").subscribe("*", handleRealtimeUpdate).catch(() => {});
    pb.collection("rental_items").subscribe("*", handleRealtimeUpdate).catch(() => {});

    return () => {
      pb.collection("rentals").unsubscribe(rentalId).catch(() => {});
      pb.collection("payments").unsubscribe("*").catch(() => {});
      pb.collection("rental_items").unsubscribe("*").catch(() => {});
    };
  }, [open, rentalId]);

  function reload() {
    if (!rentalId) {
      return;
    }

    fetchRentalDetail(rentalId)
      .then(([rentalResult, itemsResult, paymentsResult]) => {
        setError(null);
        setRental(rentalResult);
        setItems(itemsResult);
        setPayments(paymentsResult);
      })
      .catch((err: unknown) => {
        const is404 = (err as { status?: number })?.status === 404;
        if (is404) {
          onOpenChange(false);
          return;
        }
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
  const total =
    (rental?.initial_rent_amount ?? 0) +
    totalPaid(payments.map((payment) => payment.amount));

  async function handleSaveRentalEdit(values: {
    initialRentAmount: number;
    depositAmount: number;
    items: { itemType: RentalItemType; quantity: number }[];
  }) {
    if (!rental) return;
    setIsSavingRental(true);
    setEditError(null);
    try {
      await updateRental(rental.id, values);
      toast.success("Renta actualizada correctamente");
      setIsEditing(false);
      reload();
      onRentalChanged?.();
      if (cache) {
        void cache.refreshRentals();
        void cache.refreshCustomers();
      }
    } catch {
      setEditError("No se pudo actualizar la renta. Intenta de nuevo.");
    } finally {
      setIsSavingRental(false);
    }
  }

  async function handleDeleteRental() {
    if (!rental) return;
    setIsDeleting(true);
    try {
      await deleteRental(rental.id);
      toast.success(`Renta ${rental.folio} eliminada`);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onRentalChanged?.();
      if (cache) {
        void cache.refreshRentals();
        void cache.refreshCustomers();
      }
    } catch {
      toast.error("No se pudo eliminar la renta. Intenta de nuevo.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="bg-background">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {!rental && !error && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between py-1">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-8" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-16" />
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                    <Skeleton className="size-10 rounded-full shrink-0" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-11 flex-1 rounded-xl" />
                <Skeleton className="h-11 flex-1 rounded-xl" />
              </div>
            </div>
          )}

          {rental && (
            <>
              {editError && (
                <p className="text-destructive text-sm mb-2">{editError}</p>
              )}
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <RentalEditForm
                    initialValues={{
                      initialRentAmount: rental.initial_rent_amount,
                      depositAmount: rental.deposit_amount,
                      items: items.map((item) => ({
                        itemType: item.item_type,
                        quantity: item.quantity,
                      })),
                    }}
                    folio={rental.folio}
                    onSubmit={(values) => void handleSaveRentalEdit(values)}
                    onCancel={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    onDelete={() => setDeleteConfirmOpen(true)}
                    isSubmitting={isSavingRental}
                  />
                </div>
              ) : (
                <>
                  {/* A. Encabezado */}
                  <SheetHeader className="flex flex-row items-center justify-between gap-2 border-b-0">
                    <div className="flex items-center gap-2">
                      <SheetTitle>Renta {rental.folio}</SheetTitle>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        aria-label={`Editar renta ${rental.folio}`}
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                    <RentalStatusBadge status={rental.status} bordered />
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
                  <section className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                      <Receipt aria-hidden="true" className="text-primary size-4" />
                      Resumen
                    </h2>
                    <dl className="bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm">
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
                          {formatDateDisplay(rental.created)}
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
                      {rental.status === "RETURNED" && (
                        <div className="flex justify-between items-center">
                          <dt className="text-muted-foreground">
                            Depósito devuelto
                          </dt>
                          <dd className="flex items-center gap-1">
                            {formatCurrencyMXN(rental.deposit_returned_amount)}
                            <button
                              type="button"
                              aria-label="Editar depósito devuelto"
                              onClick={() => setReturnEditDialogOpen(true)}
                              className="text-muted-foreground hover:text-foreground p-1"
                            >
                              <Pencil aria-hidden="true" className="size-3" />
                            </button>
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-2 mt-1">
                        <dt>Total pagado</dt>
                        <dd>{formatCurrencyMXN(total)}</dd>
                      </div>
                    </dl>
                  </section>

                  {/* C. Historial de pagos */}
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                        <History aria-hidden="true" className="text-primary size-4" />
                        Historial de pagos
                      </h2>
                      {payments.length + (rental.status === "RETURNED" ? 1 : 0) > 0 && (
                        <span className="bg-primary-soft text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                          {payments.length + (rental.status === "RETURNED" ? 1 : 0)}
                        </span>
                      )}
                    </div>
                    {payments.length === 0 && rental.status !== "RETURNED" ? (
                      <div className="bg-card flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-6 text-center shadow-xs">
                        <PiggyBank className="size-8 text-muted-foreground/40" />
                        <p className="font-semibold text-foreground text-sm">Sin pagos registrados</p>
                        <p className="text-muted-foreground text-xs">Los pagos registrados aparecerán aquí.</p>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {[...payments].reverse().map((payment) => {
                          const Icon = PAYMENT_TYPE_ICONS[payment.payment_type];
                          const isDeposit = payment.payment_type === "deposit";
                          const isAdjustment = payment.payment_type === "adjustment";
                          const badgeClass = isDeposit
                            ? "bg-primary-soft text-primary"
                            : isAdjustment
                              ? "bg-warning-soft text-warning-soft-foreground"
                              : "bg-success-soft text-success";
                          const iconColorClass = isDeposit
                            ? "text-primary"
                            : isAdjustment
                              ? "text-warning-soft-foreground"
                              : "text-success";

                          return (
                            <li
                              key={payment.id}
                              className="bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-xs"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                                    badgeClass,
                                  )}
                                >
                                  <Icon className={cn("size-5", iconColorClass)} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">
                                    {paymentTypeLabel(payment.payment_type)}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {formatDateTimeDisplay(payment.created)}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    Registró:{" "}
                                    {payment.expand?.created_by?.name ?? "—"}
                                  </p>
                                </div>
                                <p className="shrink-0 font-bold text-foreground">
                                  {formatCurrencyMXN(payment.amount)}
                                </p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    aria-label="Editar pago"
                                    onClick={() => {
                                      setSelectedPaymentForEdit(payment);
                                      setPaymentEditDialogOpen(true);
                                    }}
                                    className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                                  >
                                    <Pencil aria-hidden="true" className="size-4" />
                                  </button>
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
                                </div>
                              </div>
                              {payment.note && (
                                <div className="w-full flex items-start gap-2 rounded-lg bg-background border border-border/60 px-2.5 py-1.5 text-xs text-foreground">
                                  <MessageSquare aria-hidden="true" className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                  <span className="font-normal break-all break-words leading-relaxed">{payment.note}</span>
                                </div>
                              )}
                            </li>
                          );
                        })}

                        {rental.status === "RETURNED" && (
                          <li
                            key="returned-deposit-item"
                            className="bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                aria-hidden="true"
                                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                              >
                                <RotateCcw className="size-5 text-muted-foreground" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground">
                                  Devolución de depósito
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {formatDateTimeDisplay(
                                    rental.returned_at || rental.updated,
                                  )}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  Registró:{" "}
                                  {rental.expand?.returned_by?.name ?? "—"}
                                </p>
                              </div>
                              <p className="shrink-0 font-bold text-muted-foreground">
                                -{formatCurrencyMXN(rental.deposit_returned_amount)}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  aria-label="Editar devolución"
                                  onClick={() => setReturnEditDialogOpen(true)}
                                  className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                                >
                                  <Pencil aria-hidden="true" className="size-4" />
                                </button>
                              </div>
                            </div>
                            {rental.note && (
                              <div className="w-full flex items-start gap-2 rounded-lg bg-background border border-border/60 px-2.5 py-1.5 text-xs text-foreground">
                                <MessageSquare aria-hidden="true" className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                <span className="font-normal break-all break-words leading-relaxed">{rental.note}</span>
                              </div>
                            )}
                          </li>
                        )}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {rental && !isEditing && rental.status === "ACTIVE" && (
            <SheetFooter className="sticky -bottom-4 -mx-4 -mb-4 z-20 mt-auto flex-row gap-2 border-t bg-background px-4 pt-3 pb-8 shadow-none">
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => {
                  setReturnDialogOpen(true);
                }}
                className="flex-1 bg-card hover:bg-muted border border-border shadow-xs"
              >
                Devolver
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  setPaymentDialogOpen(true);
                }}
                className="flex-1"
              >
                Registrar pago
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
          businessName={import.meta.env.VITE_BUSINESS_NAME}
          businessPhone={import.meta.env.VITE_BUSINESS_PHONE}
          customerName={rental.expand?.customer_id?.name ?? ""}
          customerPhone={rental.expand?.customer_id?.phone ?? ""}
          suggestedAmount={suggestedAmount}
          initialRentAmount={rental.initial_rent_amount}
          hasPreviousRentPayment={!!lastRentPayment}
          onRegistered={(_payment, receipt) => {
            // Unlike `onReturned` below (a return closes the rental out
            // entirely), a payment leaves the rental active — the detail
            // sheet stays open underneath the success summary so "Aceptar"
            // just reveals the same, now-updated rental instead of
            // redirecting the visitor away from what they were looking at.
            setPaymentDialogOpen(false);
            setPaymentCreatedReceipt(receipt);
            setPaymentSummaryOpen(true);
            reload();
            onRentalChanged?.();
          }}
        />
      )}

      {rental && (
        <PaymentEditDialog
          open={paymentEditDialogOpen}
          onOpenChange={setPaymentEditDialogOpen}
          payment={selectedPaymentForEdit}
          customerName={rental.expand?.customer_id?.name}
          onPaymentUpdated={() => {
            reload();
            onRentalChanged?.();
            if (cache) {
              void cache.refreshRentals();
            }
          }}
          onPaymentDeleted={() => {
            reload();
            onRentalChanged?.();
            if (cache) {
              void cache.refreshRentals();
            }
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
            setReturnDialogOpen(false);
            setReturnReceipt(receipt);
            setReturnSummaryOpen(true);
            onOpenChange(false);
            reload();
            onRentalChanged?.();
          }}
        />
      )}

      <ReturnCreatedSummary
        open={returnSummaryOpen}
        onOpenChange={(next) => {
          setReturnSummaryOpen(next);
          if (!next) {
            onOpenChange(false);
          }
        }}
        receipt={returnReceipt}
        onGoHome={() => {
          setReturnSummaryOpen(false);
          onOpenChange(false);
        }}
      />

      <PaymentCreatedSummary
        open={paymentSummaryOpen}
        onOpenChange={setPaymentSummaryOpen}
        receipt={paymentCreatedReceipt}
        onContinue={() => setPaymentSummaryOpen(false)}
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

      {rental && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="¿Eliminar esta renta?"
          description={`La renta ${rental.folio} y todos sus pagos y productos registrados se eliminarán permanentemente de la base de datos. Esta acción no se puede deshacer.`}
          confirmLabel={isDeleting ? "Eliminando..." : "Sí, eliminar renta"}
          tone="destructive"
          isConfirming={isDeleting}
          onConfirm={handleDeleteRental}
        />
      )}
      {rental && rental.status === "RETURNED" && (
        <ReturnEditDialog
          open={returnEditDialogOpen}
          onOpenChange={setReturnEditDialogOpen}
          rentalId={rental.id}
          folio={rental.folio}
          currentDepositReturned={rental.deposit_returned_amount}
          currentNote={rental.note || ""}
          onUpdated={(updated) => {
            setRental((prev) =>
              prev ? { ...prev, ...updated } : prev,
            );
            onRentalChanged?.();
          }}
        />
      )}
    </>
  );
}
