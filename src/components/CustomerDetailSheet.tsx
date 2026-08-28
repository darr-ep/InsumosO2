import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import { CredentialCameraCapture } from "@/components/CredentialCameraCapture";
import { ID_CARD_ASPECT_RATIO } from "@/lib/credentialCameraCrop";
import {
  getCredentialPhotoUrl,
  getCustomer,
  updateCustomerCredentialPhoto,
  type CustomerRecord,
} from "@/data/customers.repo";
import { listRentalsForCustomer, type RentalRecord } from "@/data/rentals.repo";
import { isCredentialPending } from "@/domain/customers/customer";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §16.6 (ficha de cliente — vista contextual, no ruta) + §15
 * (credencial protegida) + §16.13 ("credencial pendiente" es un estado a
 * diseñar explícitamente) + CU7. Task 3.4.
 *
 * Opened from `RentalDetailSheet` (§18) or from `CustomerPicker` inside
 * "Nueva renta" (§16.6) — wiring is task 3.5, this component only needs a
 * `customerId`.
 *
 * Real bug fix (Redesign Round 2, Batch 2 — Clientes screen): the rentals
 * list used to be one mislabeled "Historial de rentas" section mixing
 * ACTIVE and RETURNED rentals together, contradicting the business owner's
 * own principle stated in this same round's brief ("Diferenciar claramente
 * 'rentas activas' del 'historial de rentas'"). Now split into two
 * sections filtered client-side over the already-fetched `rentals` array —
 * zero new fetches, pure display fix.
 *
 * Feature: Credential Photo Camera + Compression (Batch 3b) — two real UX
 * changes, business owner's explicit request:
 * 1. Eager fetch + blur-and-reveal: as soon as the sheet opens for a
 *    non-pending customer, `getCredentialPhotoUrl` is called automatically
 *    (still gated behind opening this one customer's own detail sheet —
 *    never a bulk listing, so §15's "no aparece en listados" still holds).
 *    The image renders immediately inside a fixed ID-card-shaped box
 *    (reusing `CredentialCameraCapture`'s own `ID_CARD_ASPECT_RATIO`) with
 *    a CSS blur and a "Ver credencial" overlay button. Revealing is a
 *    client-side toggle (`revealed` state) — no re-fetch.
 * 2. The retry-upload flow ("credencial pendiente") now uses
 *    `CredentialCameraCapture` directly, wired straight to
 *    `updateCustomerCredentialPhoto` — capture already IS a compressed,
 *    correctly-shaped `File` (see that component's own tests), so the
 *    former two-step `retryFile` state + separate "Guardar credencial"
 *    confirm button is gone; `onCapture` firing goes straight to the
 *    upload call, keeping the "Guardando…" loading-state pattern already
 *    established elsewhere in this project (`CustomerForm`, other write
 *    dialogs).
 */

export interface CustomerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
}

export function CustomerDetailSheet({
  open,
  onOpenChange,
  customerId,
}: CustomerDetailSheetProps) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [rentals, setRentals] = useState<RentalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [isLoadingCredential, setIsLoadingCredential] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const [retryError, setRetryError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Pure fetch, no setState inside — same reasoning as
  // RentalDetailSheet.tsx#fetchRentalDetail: avoids a
  // react-hooks/set-state-in-effect false positive when this is called
  // directly from the effect body below.
  function fetchCustomerDetail(id: string) {
    return Promise.all([getCustomer(id), listRentalsForCustomer(id)]);
  }

  useEffect(() => {
    if (!open || !customerId) {
      return;
    }

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
        setRetryError(null);

        // Eager fetch: fires as soon as the sheet opens for a customer who
        // already has a credential photo — no button tap needed. Still
        // gated behind this one customer's own sheet, never a listing.
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

    setIsUploading(true);
    setRetryError(null);

    try {
      const updated = await updateCustomerCredentialPhoto(customer.id, file);
      setCustomer(updated);
      setCredentialUrl(null);
      setRevealed(false);

      // Same eager-fetch behavior as on sheet open — the freshly uploaded
      // photo shows up blurred immediately, no extra tap required.
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
      setRetryError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setIsUploading(false);
    }
  }

  const pending = customer
    ? isCredentialPending(customer.credential_photo)
    : false;

  // Real bug fix (Redesign Round 2, Batch 2): this section used to be one
  // "Historial de rentas" list mixing ACTIVE and RETURNED rentals together
  // — mislabeled, and a direct contradiction of the business owner's own
  // explicit principle ("Diferenciar claramente 'rentas activas' del
  // 'historial de rentas'"). Pure client-side filter over the
  // already-fetched `rentals` array — zero new fetches.
  const activeRentals = rentals.filter((rental) => rental.status === "ACTIVE");
  const historialRentals = rentals.filter(
    (rental) => rental.status !== "ACTIVE",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {error && <p className="text-destructive text-sm">{error}</p>}

        {!customer && !error && (
          <p className="text-muted-foreground text-sm">Cargando…</p>
        )}

        {customer && (
          <>
            <SheetHeader>
              <SheetTitle>{customer.name}</SheetTitle>
            </SheetHeader>
            <p className="text-muted-foreground text-sm">{customer.phone}</p>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Credencial
              </h2>

              {pending ? (
                <div className="flex flex-col gap-2">
                  {/* §16.13/§21/Anexo A.5: "credencial pendiente" made
                      visible here, with a way to complete it later — not a
                      dead end. */}
                  <p className="text-muted-foreground text-sm">
                    Credencial pendiente. Puedes agregarla ahora.
                  </p>
                  {isUploading ? (
                    <p className="text-muted-foreground text-sm">
                      Guardando…
                    </p>
                  ) : (
                    <CredentialCameraCapture
                      onCapture={(file) => void handleRetryCapture(file)}
                    />
                  )}
                  {retryError && (
                    <p className="text-destructive text-sm">{retryError}</p>
                  )}
                </div>
              ) : credentialUrl ? (
                <div
                  className="relative w-48 overflow-hidden rounded-md border bg-black"
                  style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
                >
                  <img
                    src={credentialUrl}
                    alt="Credencial del cliente"
                    className={`h-full w-full object-cover transition-[filter] duration-200 ${
                      revealed ? "" : "blur-md"
                    }`}
                  />
                  {!revealed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Button
                        type="button"
                        variant="secondary"
                        className="bg-background/80"
                        onClick={() => setRevealed(true)}
                      >
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

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Rentas activas
              </h2>

              {activeRentals.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Sin rentas activas.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {activeRentals.map((rental) => (
                    <RentalRow key={rental.id} rental={rental} />
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Historial
              </h2>

              {historialRentals.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Sin historial.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {historialRentals.map((rental) => (
                    <RentalRow key={rental.id} rental={rental} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Shared row markup for both the "Rentas activas" and "Historial" lists —
// identical visual output to what the single mixed list rendered before
// this split, just reused across the two sections instead of duplicated.
function RentalRow({ rental }: { rental: RentalRecord }) {
  return (
    <li className="flex items-center justify-between rounded-md border p-3">
      <div>
        <p className="font-medium">{rental.folio}</p>
        <p className="text-muted-foreground text-sm">
          {formatCurrencyMXN(rental.initial_rent_amount)}
        </p>
      </div>
      <RentalStatusBadge status={rental.status} />
    </li>
  );
}
