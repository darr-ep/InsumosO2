import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * "requiere revisión") + Anexo A.3 + CU2. Task 2.5 — real content replacing
 * the Phase 0 placeholder. Cards, not a Table, for mobile legibility (§17).
 * Tapping a card doesn't open Detalle de renta yet — that Sheet is task 3.3,
 * wired here in task 3.5.
 */

export function DashboardScreen() {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {rental.expand?.customer_id?.name ?? "Cliente"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <p>Folio: {rental.folio}</p>
                      <p>
                        Desde:{" "}
                        {new Date(rental.created).toLocaleDateString("es-MX")}
                      </p>
                      <p>Renta: {formatCurrencyMXN(rental.initial_rent_amount)}</p>
                    </CardContent>
                  </Card>
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
                    <Card className="border-amber-500">
                      <CardHeader>
                        <CardTitle>
                          {rental.expand?.customer_id?.name ?? "Cliente"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        <p>
                          {daysSince(new Date(rental.created), now)} días
                          activa · Revisar renta
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
