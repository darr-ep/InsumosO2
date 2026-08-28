import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/SearchBar";
import { RentalCard } from "@/components/RentalCard";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import {
  listActiveRentals,
  searchRentals,
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
 *
 * Redesign nav batch (business-owner brief, round 2): Buscar is no longer
 * its own route — "El Dashboard debe ser el centro de la aplicación y debe
 * permitir descubrir rápidamente las funciones principales sin una barra
 * inferior con demasiadas opciones." `SearchBar` + the debounce/search
 * state that used to live in the deleted `SearchScreen` now live here as
 * internal state. While a query is active, the search results replace the
 * active-rentals list and "Requiere revisión" section entirely (one clear
 * list at a time, not two stacked) — matching the original SearchScreen's
 * exact debounce/derived-empty-on-clear behavior.
 *
 * Redesign layout-reorder batch (business-owner brief, round 3): the "5-10
 * segundos" rule for this screen specifically requires this content order
 * — "1. Buscador prominente 2. CTA 'Nueva renta' 3. Resumen compacto de
 * rentas activas 4. Indicador de rentas antiguas 5. Lista de rentas
 * activas/recientes". The CTA sits above the search/summary conditional so
 * it stays reachable in both the searching and idle states ("¿Puedo
 * registrar una nueva renta?" must always be answerable). No new
 * data-fetching was added — the active-rentals count is derived from
 * `rentals` (already fetched by the existing effect below).
 */

const SEARCH_DEBOUNCE_MS = 300;

export function DashboardScreen() {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RentalWithCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(() => {
      if (cancelled) {
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      searchRentals(trimmed)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchError("No se pudo buscar. Intenta de nuevo.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query]);

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

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length > 0;
  // Derived at render instead of cleared inside the effect above (avoids a
  // setState-in-effect cascading render for the "query was cleared" case,
  // same approach CustomerPicker/the old SearchScreen used) — `results` may
  // briefly hold a stale search's items once the query is emptied, but
  // they're never shown since `isSearchActive` is false then.
  const visibleResults = isSearchActive ? results : [];

  return (
    <div className="flex flex-col gap-6 p-4 pb-8">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <SearchBar value={query} onChange={setQuery} />

      <Button asChild size="lg" className="w-full">
        <Link to="/nueva-renta">Nueva renta</Link>
      </Button>

      {isSearchActive ? (
        <>
          {searchError && (
            <p className="text-destructive text-sm">{searchError}</p>
          )}
          {isSearching && (
            <p className="text-muted-foreground text-sm">Buscando…</p>
          )}
          {!isSearching &&
            !searchError &&
            visibleResults.length === 0 && (
              <p className="text-muted-foreground text-sm">Sin resultados.</p>
            )}

          {visibleResults.length > 0 && (
            <ul className="flex flex-col gap-3">
              {visibleResults.map((rental) => (
                <li key={rental.id}>
                  <RentalCard
                    customerName={
                      rental.expand?.customer_id?.name ?? "Cliente"
                    }
                    onClick={() => openRentalDetail(rental.id)}
                  >
                    <p>Folio: {rental.folio}</p>
                    <p>Teléfono: {rental.expand?.customer_id?.phone ?? "—"}</p>
                  </RentalCard>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
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

              {rentals.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No hay rentas activas todavía.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {rentals.map((rental) => (
                    <li key={rental.id}>
                      <RentalCard
                        customerName={
                          rental.expand?.customer_id?.name ?? "Cliente"
                        }
                        onClick={() => openRentalDetail(rental.id)}
                      >
                        <p>Folio: {rental.folio}</p>
                        <p>
                          Desde:{" "}
                          {new Date(rental.created).toLocaleDateString(
                            "es-MX",
                          )}
                        </p>
                        <p>
                          Renta: {formatCurrencyMXN(rental.initial_rent_amount)}
                        </p>
                      </RentalCard>
                    </li>
                  ))}
                </ul>
              )}
            </>
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
