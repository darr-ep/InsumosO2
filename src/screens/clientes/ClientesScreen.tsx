import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { CustomerCard } from "@/components/CustomerCard";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import { EmptyState } from "@/components/EmptyState";
import { useDataCache } from "@/app/DataCacheContext";
import {
  searchCustomers,
  type CustomerRecord,
} from "@/data/customers.repo";

/**
 * Clientes screen — Redesign Round 2, Batch 2 (business-owner brief,
 * verbatim): "Debe existir como pantalla real porque un cliente puede
 * tener múltiples rentas y queremos evitar volver a capturar sus datos.
 * Debe ser una lista simple con búsqueda. Al seleccionar un cliente,
 * mostrar sus datos, rentas activas, historial asociado y acceso a su
 * credencial. No convertirlo en CRM ni agregar funcionalidades nuevas."
 *
 * Genuinely new screen/route, but NOT new business logic or a new module:
 * customer search (`searchCustomers`) and the full customer detail view
 * (`CustomerDetailSheet`, with its own active/historial split and
 * credential access) already existed — this only adds a new entry point.
 * Structurally mirrors `HistorialScreen`'s fetch/loading/error/empty-state
 * pattern (idle-state fetch via `listCustomers`), layered with
 * `DashboardScreen`'s idle-vs-active-search split (`SearchBar` +
 * debounced `searchCustomers`, same 300ms debounce, same
 * "one list visible at a time" rule).
 *
 * AppHeader variant: home variant (no `showBack`). Documented judgment
 * call — the business-owner brief's header pattern describes "perfil"
 * (`AccountMenu`) as appearing on Dashboard specifically, and every other
 * screen using `AppHeader` so far (`HistorialScreen`, `RentalNewScreen`)
 * is a genuine drill-down reached via navigation, so it uses the
 * secondary (`showBack`) variant. Clientes is different: round 3's own
 * bottom-nav plan (not yet wired — that's Batch 3) makes it one of only 2
 * PRIMARY destinations (Inicio, Clientes), reachable directly from the
 * tab bar. A primary tab has nowhere obviously "back" to, so it gets the
 * home variant (title + `AccountMenu`) instead — same as Dashboard.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function ClientesScreen() {
  const {
    customers,
    customersError,
    loadCustomersIfNeeded,
    refreshCustomers,
    rentals,
    loadRentalsIfNeeded,
  } = useDataCache();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);

  useEffect(() => {
    loadCustomersIfNeeded();
    loadRentalsIfNeeded();
  }, [loadCustomersIfNeeded, loadRentalsIfNeeded]);

  // Redesign — UX/UI pass: per-customer "N rentas activas" badge (business-
  // owner request) — a count map derived from the `rentals` domain already
  // shared with DashboardScreen (DataCacheContext), not a new fetch of its
  // own anymore.
  const activeRentalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rental of rentals ?? []) {
      counts.set(
        rental.customer_id,
        (counts.get(rental.customer_id) ?? 0) + 1,
      );
    }
    return counts;
  }, [rentals]);

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

      searchCustomers(trimmed)
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

  function openCustomerDetail(customerId: string) {
    setSelectedCustomerId(customerId);
    setCustomerDetailOpen(true);
  }

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length > 0;
  // Derived at render instead of cleared inside the effect above — same
  // approach as DashboardScreen's own search fold (avoids a
  // setState-in-effect cascading render for the "query was cleared" case).
  const visibleResults = isSearchActive ? results : [];
  const visibleCustomers = isSearchActive ? visibleResults : (customers ?? []);

  return (
    <>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-2">
        <AppHeader title="Clientes" />
        <div className="px-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Nombre del cliente"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">

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
                <p className="text-muted-foreground text-sm">
                  Sin resultados.
                </p>
              )}
          </>
        ) : (
          <>
            {customersError && (
              <p className="text-destructive text-sm">{customersError}</p>
            )}

            {customers === null && !customersError && (
              <p className="text-muted-foreground text-sm">Cargando…</p>
            )}

            {customers !== null && customers.length === 0 && !customersError && (
              <EmptyState
                icon={Users}
                title="Aún no hay clientes registrados."
              />
            )}
          </>
        )}

        {visibleCustomers.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visibleCustomers.map((customer, index) => {
              const activeCount = activeRentalCounts.get(customer.id) ?? 0;
              return (
                <li
                  key={customer.id}
                  className="animate-card-enter"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <CustomerCard
                    name={customer.name}
                    phone={customer.phone}
                    activeCount={activeCount}
                    onClick={() => openCustomerDetail(customer.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <CustomerDetailSheet
          open={customerDetailOpen}
          onOpenChange={setCustomerDetailOpen}
          customerId={selectedCustomerId}
          onCustomerChanged={refreshCustomers}
        />
      </div>
    </>
  );
}
