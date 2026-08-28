import { useEffect, useState } from "react";
import { RentalCard } from "@/components/RentalCard";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import {
  listReturnedRentals,
  type RentalWithCustomer,
} from "@/data/rentals.repo";

/**
 * Historial de rentas — new route added by the navigation/screen-architecture
 * redesign batch (business-owner brief, round 2: "Historial de rentas" is
 * one of the 5 pantallas principales, not an existing screen). Reached only
 * from the header's secondary menu (`AppLayout`'s `DropdownMenu`), never
 * from a bottom tab bar — the brief explicitly removed that pattern.
 *
 * Genuinely new screen/route, but NOT new business logic or a new module:
 * it's a different filter/view (RETURNED) over the exact same `rentals`
 * collection Dashboard already reads (ACTIVE), reusing `RentalCard` and
 * `RentalDetailSheet`/`CustomerDetailSheet` exactly like Dashboard/the old
 * Search screen did (§18's "Detalle de renta is a contextual Sheet, never
 * its own route" applies here too).
 */

export function HistorialScreen() {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(
    null,
  );
  const [rentalDetailOpen, setRentalDetailOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listReturnedRentals()
      .then((items) => {
        if (!cancelled) {
          setRentals(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudo cargar el historial de rentas.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openRentalDetail(rentalId: string) {
    setSelectedRentalId(rentalId);
    setRentalDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="text-lg font-semibold">Historial de rentas</h1>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {rentals === null && !error && (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      )}

      {rentals !== null &&
        (rentals.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aún no hay rentas devueltas.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rentals.map((rental) => (
              <li key={rental.id}>
                <RentalCard
                  customerName={rental.expand?.customer_id?.name ?? "Cliente"}
                  status={rental.status}
                  folio={rental.folio}
                  onClick={() => openRentalDetail(rental.id)}
                >
                  <p>
                    Devuelta:{" "}
                    {new Date(rental.returned_at).toLocaleDateString("es-MX")}
                  </p>
                </RentalCard>
              </li>
            ))}
          </ul>
        ))}

      <RentalDetailSheet
        open={rentalDetailOpen}
        onOpenChange={setRentalDetailOpen}
        rentalId={selectedRentalId}
        onViewCustomer={(customerId) => {
          setSelectedCustomerId(customerId);
          setCustomerDetailOpen(true);
        }}
      />
      <CustomerDetailSheet
        open={customerDetailOpen}
        onOpenChange={setCustomerDetailOpen}
        customerId={selectedCustomerId}
      />
    </div>
  );
}
