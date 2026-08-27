import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { RentalCard } from "@/components/RentalCard";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import {
  listActiveRentals,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import {
  daysSince,
  isStaleRental,
  staleRentalDaysThreshold,
} from "@/domain/rentals/dashboard";
import { formatCurrencyMXN } from "@/lib/currency";

/**
 * SDD.md §16.3 (regla de los 10 segundos) + §16.4/§16.6 (rentas activas +
 * "requiere revisión") + Anexo A.3 + CU2 + §18 ("Dashboard → tap rental
 * card → Sheet Detalle de renta"). Task 2.5 (real content) + task 3.5
 * (wiring `RentalDetailSheet`/`CustomerDetailSheet`, task 3.3/3.4).
 */

export function DashboardScreen() {
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

    listActiveRentals()
      .then((items) => {
        if (!cancelled) {
          setRentals(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudieron cargar las rentas activas.");
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

  const thresholdDays = staleRentalDaysThreshold(
    import.meta.env.VITE_STALE_RENTAL_DAYS,
  );
  const now = new Date();
  const staleRentals = (rentals ?? []).filter((rental) =>
    isStaleRental(new Date(rental.created), thresholdDays, now),
  );

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Button asChild size="sm">
          <Link to="/nueva-renta">Nueva renta</Link>
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {rentals === null && !error && (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      )}

      {rentals !== null && (
        <>
          <div>
            <p className="text-sm text-muted-foreground">Rentas activas</p>
            <p className="text-foreground text-3xl font-semibold">
              {rentals.length}
            </p>
          </div>

          {rentals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay rentas activas todavía.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rentals.map((rental) => (
                <li key={rental.id}>
                  <RentalCard
                    customerName={rental.expand?.customer_id?.name ?? "Cliente"}
                    onClick={() => openRentalDetail(rental.id)}
                  >
                    <p>Folio: {rental.folio}</p>
                    <p>
                      Desde:{" "}
                      {new Date(rental.created).toLocaleDateString("es-MX")}
                    </p>
                    <p>Renta: {formatCurrencyMXN(rental.initial_rent_amount)}</p>
                  </RentalCard>
                </li>
              ))}
            </ul>
          )}

          {staleRentals.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Requiere revisión</h2>
              <ul className="flex flex-col gap-3">
                {staleRentals.map((rental) => (
                  <li key={rental.id}>
                    <RentalCard
                      customerName={
                        rental.expand?.customer_id?.name ?? "Cliente"
                      }
                      onClick={() => openRentalDetail(rental.id)}
                      cardClassName="border-amber-500"
                      contentClassName="text-sm text-muted-foreground"
                    >
                      <p>
                        {daysSince(new Date(rental.created), now)} días
                        activa · Revisar renta
                      </p>
                    </RentalCard>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

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
