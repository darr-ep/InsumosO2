import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { RentalCard } from "@/components/RentalCard";
import { DashboardStats } from "@/components/DashboardStats";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import {
  listActiveRentals,
  listActiveRentalItems,
  searchRentals,
  type RentalItemRecord,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import {
  isStaleRental,
  staleRentalDaysThreshold,
} from "@/domain/rentals/dashboard";
import {
  availableStock,
  countActiveQuantityByType,
  totalStockFromEnv,
} from "@/domain/rentals/availability";
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
 * stats/stale-banner/active-rentals list entirely (one clear list at a
 * time, not two stacked) — matching the original SearchScreen's exact
 * debounce/derived-empty-on-clear behavior.
 *
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief,
 * verbatim): "El título 'Dashboard' debe desaparecer del contenido y pasar
 * al navbar... En Dashboard: O2 Insumos/título a la izquierda y perfil a
 * la derecha." Replaced the inline `<h1>Dashboard</h1>` with `AppHeader`'s
 * home variant, titled with the existing `VITE_BUSINESS_NAME` env var
 * (already used for receipts/branding elsewhere — `RentalNewScreen.tsx`,
 * `RentalDetailSheet.tsx`) instead of a new hardcoded literal, for
 * consistency. Falls back to "Inicio" if that env var is ever empty/unset
 * at runtime, so the header is never blank.
 *
 * Redesign Round 2, Batch 4 (Dashboard Restructure, business-owner brief,
 * verbatim): "Debajo del navbar: buscador prominente. Después: CTA 'Nueva
 * renta'. Después: estadísticas compactas: Rentas activas, Concentradores
 * disponibles y Tanques disponibles. Los valores 0 deben mostrarse en gris
 * neutro, no como error. Después: indicador discreto de rentas antiguas/
 * necesitan revisión si existen. Después: lista de rentas activas.
 * 'Nueva renta' debe ser un CTA sticky inferior, teniendo suficiente
 * padding para que no tape la última renta."
 *
 * Two decisions already confirmed by the business owner directly (not
 * re-litigated here):
 * 1. The CTA is a pinned, ALWAYS-VISIBLE bottom bar — not "sticky only
 *    after scrolling past its literal DOM position". It's rendered as a
 *    separate `sticky bottom-0 mt-auto` block, a flex sibling AFTER the
 *    scrollable content block, both inside a `flex min-h-full flex-col`
 *    root. `<main>` (AppLayout) is `flex-1 overflow-y-auto` — the nearest
 *    scrolling ancestor — so `sticky bottom-0` here correctly pins within
 *    it (confirmed structurally, not just assumed; see
 *    `DashboardScreen.test.tsx`'s pinned-bar test). `mt-auto` makes the CTA
 *    hug the bottom even when content is shorter than the viewport;
 *    `pb-20` (80px) on the scrollable content block is exactly the CTA
 *    bar's own rendered height (`size="lg"` Button = h-12/48px, inside a
 *    `p-4` wrapper = 16px×2/32px = 80px total), so the CTA can never
 *    visually sit on top of the last `RentalCard`.
 * 2. The former full "Requiere revisión" section (duplicated `RentalCard`s)
 *    is now a single compact, tappable banner — explicit go-ahead to
 *    simplify existing tested behavior, not just a color tweak. Tapping it
 *    toggles filtering the list to ONLY the stale rentals (simplest, least-
 *    new-surface-area option — no new dialog/route). The individual
 *    `border-warning` highlight on a stale rental's own card (Batch D)
 *    stays, now applied directly in the single unified list instead of a
 *    duplicated section.
 *
 * "Concentradores/Tanques disponibles" = REAL availability (total
 * configured stock − active rentals of that type), confirmed by the
 * business owner — `domain/rentals/availability.ts` + the
 * `VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES` env vars (same fixed-
 * env-var pattern as `VITE_STALE_RENTAL_DAYS`, Anexo A.3 precedent).
 * `listActiveRentalItems()` is fetched alongside `listActiveRentals()` in
 * the same initial load (shared loading/error state — no new surface for a
 * second independent fetch to fail differently).
 */

const SEARCH_DEBOUNCE_MS = 300;

export function DashboardScreen() {
  const [rentals, setRentals] = useState<RentalWithCustomer[] | null>(null);
  const [activeItems, setActiveItems] = useState<RentalItemRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RentalWithCustomer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [rentalDetailOpen, setRentalDetailOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [showStaleOnly, setShowStaleOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listActiveRentals(), listActiveRentalItems()])
      .then(([activeRentals, items]) => {
        if (!cancelled) {
          setRentals(activeRentals);
          setActiveItems(items);
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

  const activeQuantities = countActiveQuantityByType(activeItems);
  const concentradoresDisponibles = availableStock(
    totalStockFromEnv(import.meta.env.VITE_TOTAL_CONCENTRADORES),
    activeQuantities.concentrator,
  );
  const tanquesDisponibles = availableStock(
    totalStockFromEnv(import.meta.env.VITE_TOTAL_TANQUES),
    activeQuantities.tank,
  );

  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length > 0;
  // Derived at render instead of cleared inside the effect above (avoids a
  // setState-in-effect cascading render for the "query was cleared" case,
  // same approach CustomerPicker/the old SearchScreen used) — `results` may
  // briefly hold a stale search's items once the query is emptied, but
  // they're never shown since `isSearchActive` is false then.
  const visibleResults = isSearchActive ? results : [];

  const visibleActiveRentals =
    showStaleOnly && staleRentals.length > 0 ? staleRentals : rentals ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={import.meta.env.VITE_BUSINESS_NAME || "Inicio"} />

      <div className="flex flex-col gap-6 p-4 pb-20">
        <SearchBar value={query} onChange={setQuery} />

        {isSearchActive ? (
          <>
            {searchError && (
              <p className="text-destructive text-sm">{searchError}</p>
            )}
            {isSearching && (
              <p className="text-muted-foreground text-sm">Buscando…</p>
            )}
            {!isSearching && !searchError && visibleResults.length === 0 && (
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
                      status={rental.status}
                      folio={rental.folio}
                      onClick={() => openRentalDetail(rental.id)}
                    >
                      <p>
                        Teléfono: {rental.expand?.customer_id?.phone ?? "—"}
                      </p>
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
                <DashboardStats
                  activeRentalsCount={rentals.length}
                  concentradoresDisponibles={concentradoresDisponibles}
                  tanquesDisponibles={tanquesDisponibles}
                />

                {staleRentals.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={showStaleOnly}
                    onClick={() => setShowStaleOnly((value) => !value)}
                    className="border-warning bg-warning/10 text-foreground flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium"
                  >
                    <span>
                      {staleRentals.length}{" "}
                      {staleRentals.length === 1
                        ? "renta requiere"
                        : "rentas requieren"}{" "}
                      revisión
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {showStaleOnly ? "Ver todas" : "Ver"}
                    </span>
                  </button>
                )}

                {rentals.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No hay rentas activas todavía.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {visibleActiveRentals.map((rental) => (
                      <li key={rental.id}>
                        <RentalCard
                          customerName={
                            rental.expand?.customer_id?.name ?? "Cliente"
                          }
                          status={rental.status}
                          folio={rental.folio}
                          onClick={() => openRentalDetail(rental.id)}
                          cardClassName={
                            isStaleRental(
                              new Date(rental.created),
                              thresholdDays,
                              now,
                            )
                              ? "border-warning"
                              : undefined
                          }
                        >
                          <p>
                            Desde:{" "}
                            {new Date(rental.created).toLocaleDateString(
                              "es-MX",
                            )}
                          </p>
                          <p>
                            Renta:{" "}
                            {formatCurrencyMXN(rental.initial_rent_amount)}
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

      <div className="sticky bottom-0 mt-auto shrink-0 border-t bg-background p-4">
        <Button asChild size="lg" className="w-full">
          <Link to="/nueva-renta">Nueva renta</Link>
        </Button>
      </div>
    </div>
  );
}
