import { useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import {
  getCredentialPhotoUrl,
  getCustomer,
  updateCustomerCredentialPhoto,
  type CustomerRecord,
} from "@/data/customers.repo";
import { listRentalsForCustomer, type RentalRecord } from "@/data/rentals.repo";
import {
  isAcceptedCredentialPhotoType,
  isCredentialPending,
  isCredentialPhotoWithinSizeLimit,
} from "@/domain/customers/customer";
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

  const [retryFile, setRetryFile] = useState<File | null>(null);
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
        if (!cancelled) {
          setError(null);
          setCustomer(customerResult);
          setRentals(rentalsResult);
          setCredentialUrl(null);
          setCredentialError(null);
          setRetryFile(null);
          setRetryError(null);
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

  async function handleViewCredential() {
    if (!customer) {
      return;
    }

    setIsLoadingCredential(true);
    setCredentialError(null);

    try {
      const url = await getCredentialPhotoUrl(customer);
      setCredentialUrl(url);
    } catch {
      setCredentialError("No se pudo cargar la credencial.");
    } finally {
      setIsLoadingCredential(false);
    }
  }

  function handleRetryFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setRetryFile(null);
      return;
    }

    if (!isAcceptedCredentialPhotoType(file.type)) {
      setRetryError("Formato de imagen no válido. Usa JPG, PNG o WEBP.");
      setRetryFile(null);
      return;
    }

    if (!isCredentialPhotoWithinSizeLimit(file.size)) {
      setRetryError("La imagen no puede pesar más de 8MB.");
      setRetryFile(null);
      return;
    }

    setRetryError(null);
    setRetryFile(file);
  }

  async function handleRetryUpload() {
    if (!customer || !retryFile) {
      return;
    }

    setIsUploading(true);
    setRetryError(null);

    try {
      const updated = await updateCustomerCredentialPhoto(
        customer.id,
        retryFile,
      );
      setCustomer(updated);
      setRetryFile(null);
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
                  <Label htmlFor="customer-retry-credential-photo">
                    Foto de credencial
                  </Label>
                  <Input
                    id="customer-retry-credential-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleRetryFileChange}
                  />
                  {retryError && (
                    <p className="text-destructive text-sm">{retryError}</p>
                  )}
                  {retryFile && !retryError && (
                    <Button
                      type="button"
                      disabled={isUploading}
                      onClick={() => void handleRetryUpload()}
                    >
                      Guardar credencial
                    </Button>
                  )}
                </div>
              ) : credentialUrl ? (
                <img
                  src={credentialUrl}
                  alt="Credencial del cliente"
                  className="max-h-64 rounded-md border object-contain"
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoadingCredential}
                  onClick={() => void handleViewCredential()}
                >
                  Ver credencial
                </Button>
              )}

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
