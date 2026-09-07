import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { IdCard, Loader2, Lock, PackageOpen, Pencil, Phone, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AnimatedSwitch } from "@/components/ui/animated-switch";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerEditForm } from "@/components/CustomerEditForm";
import { ID_CARD_ASPECT_RATIO } from "@/lib/credentialCameraCrop";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateDisplay } from "@/lib/formatDate";
import {
  getCredentialPhotoUrl,
  getCustomer,
  updateCustomerContactInfo,
  updateCustomerCredentialPhoto,
  type CustomerRecord,
} from "@/data/customers.repo";
import { listRentalsForCustomer, type RentalRecord } from "@/data/rentals.repo";
import { isCredentialPending } from "@/domain/customers/customer";
import { formatCurrencyMXN } from "@/lib/currency";

export interface CustomerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  onCustomerChanged?: (customer: CustomerRecord) => void;
}

export function CustomerDetailSheet({
  open,
  onOpenChange,
  customerId,
  onCustomerChanged,
}: CustomerDetailSheetProps) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [rentals, setRentals] = useState<RentalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rentalSegment, setRentalSegment] = useState<"activas" | "historial">(
    "activas",
  );

  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [isLoadingCredential, setIsLoadingCredential] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [credentialViewerOpen, setCredentialViewerOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isUploadingCredentialPhoto, setIsUploadingCredentialPhoto] =
    useState(false);
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(
    null,
  );
  const [rentalDetailOpen, setRentalDetailOpen] = useState(false);

  function openRentalDetail(rentalId: string) {
    setSelectedRentalId(rentalId);
    setRentalDetailOpen(true);
  }

  function fetchCustomerDetail(id: string) {
    return Promise.all([getCustomer(id), listRentalsForCustomer(id)]);
  }

  useEffect(() => {
    if (!open || !customerId) {
      setCustomer(null);
      setRentals([]);
      return;
    }

    setCustomer(null);
    setRentals([]);
    let cancelled = false;

    fetchCustomerDetail(customerId)
      .then(([customerResult, rentalsResult]) => {
        if (cancelled) {
          return;
        }

        setError(null);
        setCustomer(customerResult);
        setRentals(rentalsResult);
        setCredentialUrl(null);
        setCredentialError(null);
        setRevealed(false);
        setIsEditing(false);
        setEditError(null);
        setIsUploadingCredentialPhoto(false);
        setRentalSegment("activas");

        if (!isCredentialPending(customerResult.credential_photo)) {
          setIsLoadingCredential(true);
          getCredentialPhotoUrl(customerResult)
            .then((url) => {
              if (!cancelled) {
                setCredentialUrl(url);
              }
            })
            .catch(() => {
              if (!cancelled) {
                setCredentialError("No se pudo cargar la credencial.");
              }
            })
            .finally(() => {
              if (!cancelled) {
                setIsLoadingCredential(false);
              }
            });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudo cargar el cliente.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  async function handleRetryCapture(file: File) {
    if (!customer) {
      return;
    }

    setEditError(null);
    setIsUploadingCredentialPhoto(true);

    try {
      const updated = await updateCustomerCredentialPhoto(customer.id, file);
      setCustomer(updated);
      setCredentialUrl(null);
      setRevealed(false);

      if (!isCredentialPending(updated.credential_photo)) {
        setIsLoadingCredential(true);
        try {
          const url = await getCredentialPhotoUrl(updated);
          setCredentialUrl(url);
        } catch {
          setCredentialError("No se pudo cargar la credencial.");
        } finally {
          setIsLoadingCredential(false);
        }
      }
    } catch {
      setEditError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setIsUploadingCredentialPhoto(false);
    }
  }

  async function handleSaveEdit(values: { name: string; phone: string }) {
    if (!customer) {
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const updated = await updateCustomerContactInfo(customer.id, values);
      setCustomer(updated);
      onCustomerChanged?.(updated);
      setIsEditing(false);
    } catch {
      setEditError("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  const [displayLimit, setDisplayLimit] = useState(20);

  useEffect(() => {
    setDisplayLimit(20);
  }, [rentalSegment, customerId, open]);

  const pending = customer
    ? isCredentialPending(customer.credential_photo)
    : false;

  // Memoized so the pagination observer effects below (each keyed on one of
  // these references) don't see a new identity — and recreate the observer
  // — on every unrelated render: `.filter()` otherwise allocates a fresh
  // array every render regardless of whether `rentals` itself changed.
  const activeRentals = useMemo(
    () => rentals.filter((rental) => rental.status === "ACTIVE"),
    [rentals],
  );
  const historialRentals = useMemo(
    () => rentals.filter((rental) => rental.status !== "ACTIVE"),
    [rentals],
  );
  const displayedActiveRentals = activeRentals.slice(0, displayLimit);
  const displayedHistorialRentals = historialRentals.slice(0, displayLimit);

  const activeSentinelRef = useRef<HTMLDivElement | null>(null);
  const historialSentinelRef = useRef<HTMLDivElement | null>(null);

  // Stable ref + one effect per sentinel, keyed on the underlying list (not
  // a derived count) — a freshly-created IntersectionObserver fires
  // immediately with the CURRENT intersection state, so depending on a
  // count that changes every "load 20 more" recreates the observer and
  // cascades through the whole list (same root cause fixed in
  // ClientesScreen/DashboardScreen). `rentalSegment` is also a dependency
  // because switching tabs mounts a brand-new sentinel node that the
  // previous effect run never saw.
  useEffect(() => {
    const target = activeSentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setDisplayLimit((prev) => prev + 20);
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeRentals, rentalSegment]);

  useEffect(() => {
    const target = historialSentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setDisplayLimit((prev) => prev + 20);
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [historialRentals, rentalSegment]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="bg-background">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {!customer && !error && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-44 rounded-md" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <Skeleton className="size-11 rounded-full" />
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-40 w-full rounded-2xl" />
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-8 w-36 rounded-full" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              </div>
            </div>
          )}

          {customer && (
            <>
              {/* Rendered regardless of `isEditing`: the credential-photo
                  retry-upload is fired from inside the edit form but is
                  fire-and-forget, so it can still be loading or fail after
                  the user already saved the name/phone and left edit mode —
                  gating this on `isEditing` would silently swallow it. */}
              {isUploadingCredentialPhoto && (
                <p className="text-muted-foreground text-sm">Guardando…</p>
              )}
              {editError && (
                <p className="text-destructive text-sm">{editError}</p>
              )}
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <CustomerEditForm
                    initialValues={{ name: customer.name, phone: customer.phone }}
                    credentialUrl={credentialUrl}
                    onPhotoCaptured={(file) => void handleRetryCapture(file)}
                    onSubmit={(values) => void handleSaveEdit(values)}
                    onCancel={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    isSubmitting={isSavingEdit}
                  />
                </div>
              ) : (
                <>
                  <SheetHeader className="flex-row items-center justify-between gap-2 border-b-0 pb-1">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-lg font-semibold py-1">{customer.name}</SheetTitle>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        aria-label="Editar cliente"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </SheetHeader>

                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-500">Teléfono</span>
                        <a
                          href={`tel:${customer.phone}`}
                          className="text-base font-semibold text-slate-900 hover:underline"
                        >
                          {formatPhoneDisplay(customer.phone)}
                        </a>
                      </div>
                      <a
                      href={`tel:${customer.phone}`}
                      className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
                      aria-label={`Llamar a ${customer.name}`}
                    >
                      <Phone aria-hidden="true" className="size-5" />
                    </a>
                  </div>

                  <section className="flex flex-col gap-2 pt-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <IdCard aria-hidden="true" className="text-primary size-4" />
                      Credencial
                    </h2>

                    {pending ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <IdCard className="size-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <p className="text-sm font-semibold text-slate-900 leading-tight">
                            Sin credencial registrada
                          </p>
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                            Puedes capturarla o actualizarla editando los datos del cliente.
                          </p>
                        </div>
                      </div>
                    ) : credentialUrl ? (
                      <div
                        className="relative w-full overflow-hidden rounded-2xl border bg-black shadow-xs"
                        style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
                      >
                        <img
                          src={credentialUrl}
                          alt="Credencial del cliente"
                          onClick={() => revealed && setCredentialViewerOpen(true)}
                          className={`h-full w-full object-cover transition-[filter] duration-200 ${
                            revealed ? "cursor-zoom-in" : "blur-md"
                          }`}
                        />
                        {!revealed && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Button
                              type="button"
                              variant="secondary"
                              className="rounded-full bg-white text-slate-900 hover:bg-slate-100 font-medium px-4 shadow-md flex items-center gap-2"
                              onClick={() => setRevealed(true)}
                            >
                              <Lock aria-hidden="true" className="size-4" />
                              Ver credencial
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : isLoadingCredential ? (
                      <p className="text-muted-foreground text-sm">Cargando…</p>
                    ) : null}

                    {credentialError && (
                      <p className="text-destructive text-sm">{credentialError}</p>
                    )}
                  </section>

                  <section className="flex flex-col gap-3 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
                        <Receipt aria-hidden="true" className="text-primary size-4" />
                        Rentas
                      </h2>
                      <AnimatedSwitch
                        value={rentalSegment}
                        onChange={setRentalSegment}
                        ariaLabel="Filtrar rentas"
                        options={[
                          { value: "activas", label: "Activas", count: activeRentals.length },
                          { value: "historial", label: "Historial", count: historialRentals.length },
                        ]}
                      />
                    </div>

                    {rentalSegment === "activas" ? (
                      activeRentals.length === 0 ? (
                        <div className="flex flex-col gap-3">
                          <div className="rounded-2xl border bg-white p-6 text-center flex flex-col items-center gap-2 shadow-xs">
                            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <PackageOpen className="size-5" />
                            </div>
                            <p className="text-sm font-semibold text-slate-900">Sin rentas activas</p>
                            <p className="text-xs text-muted-foreground">Este cliente no tiene rentas en curso actualmente.</p>
                          </div>
                          <Button
                            type="button"
                            className="w-full flex items-center justify-center gap-2"
                            onClick={() => {
                              onOpenChange(false);
                              navigate("/nueva-renta");
                            }}
                          >
                            <Plus className="size-4" />
                            Nueva renta
                          </Button>
                        </div>
                      ) : (
                        <>
                          <ul className="flex flex-col gap-2">
                            {displayedActiveRentals.map((rental) => (
                              <RentalRow
                                key={rental.id}
                                rental={rental}
                                onClick={() => openRentalDetail(rental.id)}
                              />
                            ))}
                          </ul>
                          {displayedActiveRentals.length < activeRentals.length && (
                            <div
                              ref={activeSentinelRef}
                              className="flex items-center justify-center py-4 text-xs text-muted-foreground"
                            >
                              <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                              <span>Cargando más rentas…</span>
                            </div>
                          )}
                        </>
                      )
                    ) : historialRentals.length === 0 ? (
                      <div className="rounded-2xl border bg-white p-6 text-center flex flex-col items-center gap-2 shadow-xs">
                        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <PackageOpen className="size-5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-900">Sin historial</p>
                        <p className="text-xs text-muted-foreground">No hay rentas finalizadas anteriores.</p>
                      </div>
                    ) : (
                      <>
                        <ul className="flex flex-col gap-2">
                          {displayedHistorialRentals.map((rental) => (
                            <RentalRow
                              key={rental.id}
                              rental={rental}
                              onClick={() => openRentalDetail(rental.id)}
                              isHistory
                            />
                          ))}
                        </ul>
                        {displayedHistorialRentals.length < historialRentals.length && (
                          <div
                            ref={historialSentinelRef}
                            className="flex items-center justify-center py-4 text-xs text-muted-foreground"
                          >
                            <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                            <span>Cargando más rentas…</span>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {credentialUrl && (
        <Dialog
          open={credentialViewerOpen}
          onOpenChange={setCredentialViewerOpen}
        >
          <DialogContent className="max-w-md">
            <img
              src={credentialUrl}
              alt="Credencial del cliente (ampliada)"
              className="w-full rounded-md"
            />
          </DialogContent>
        </Dialog>
      )}

      <RentalDetailSheet
        open={rentalDetailOpen}
        onOpenChange={setRentalDetailOpen}
        rentalId={selectedRentalId}
      />
    </>
  );
}

function RentalRow({
  rental,
  onClick,
  isHistory = false,
}: {
  rental: RentalRecord;
  onClick: () => void;
  isHistory?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:bg-slate-50 shadow-xs"
      >
        <div className="flex flex-col gap-0.5">
          <p className={`font-semibold ${isHistory ? "text-muted-foreground" : "text-foreground"}`}>
            {rental.folio}
          </p>
          <p className="text-muted-foreground text-xs">
            Inicio {formatDateDisplay(rental.created)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RentalStatusBadge status={rental.status} />
          <span className={`font-bold ${isHistory ? "text-muted-foreground" : "text-foreground"}`}>
            {formatCurrencyMXN(rental.initial_rent_amount)}
          </span>
        </div>
      </button>
    </li>
  );
}
