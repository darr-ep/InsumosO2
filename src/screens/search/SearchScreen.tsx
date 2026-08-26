import { useEffect, useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import { searchRentals, type RentalWithCustomer } from "@/data/rentals.repo";

/**
 * SDD.md §7.4 (flujo Búsqueda) + §16.9 + CU3 + §18 ("Buscar → tap
 * resultado → Sheet Detalle de renta"). Real content (task 2.6) + wiring
 * `RentalDetailSheet`/`CustomerDetailSheet` (task 3.5, tasks 3.3/3.4).
 */

const SEARCH_DEBOUNCE_MS = 300;

export function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RentalWithCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
      setError(null);

      searchRentals(trimmed)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("No se pudo buscar. Intenta de nuevo.");
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

  const trimmedQuery = query.trim();
  // Derived at render instead of cleared inside the effect above (avoids a
  // setState-in-effect cascading render for the "query was cleared" case,
  // same approach CustomerPicker uses) — `results` may briefly hold a stale
  // search's items once the query is emptied, but they're never shown since
  // this is empty then.
  const visibleResults = trimmedQuery ? results : [];

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="text-lg font-semibold">Buscar</h1>

      <SearchBar value={query} onChange={setQuery} />

      {error && <p className="text-destructive text-sm">{error}</p>}
      {isSearching && (
        <p className="text-muted-foreground text-sm">Buscando…</p>
      )}
      {!isSearching &&
        !error &&
        trimmedQuery &&
        visibleResults.length === 0 && (
          <p className="text-muted-foreground text-sm">Sin resultados.</p>
        )}

      {visibleResults.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visibleResults.map((rental) => (
            <li key={rental.id}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => openRentalDetail(rental.id)}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {rental.expand?.customer_id?.name ?? "Cliente"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>Folio: {rental.folio}</p>
                    <p>Teléfono: {rental.expand?.customer_id?.phone ?? "—"}</p>
                  </CardContent>
                </Card>
              </button>
            </li>
          ))}
        </ul>
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
