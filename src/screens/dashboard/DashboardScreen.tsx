import { memo, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  CircleDollarSign,
  Droplet,
  PackageOpen,
  Plus,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RentalCard } from "@/components/RentalCard";
import { DashboardStats } from "@/components/DashboardStats";
import { EmptyState } from "@/components/EmptyState";
import { RentalDetailSheet } from "@/components/RentalDetailSheet";
import { CustomerDetailSheet } from "@/components/CustomerDetailSheet";
import { useDataCache } from "@/app/DataCacheContext";
import {
  searchRentals,
  type RentalWithCustomer,
} from "@/data/rentals.repo";
import {
  isStaleRental,
  staleRentalDaysThreshold,
} from "@/domain/rentals/dashboard";
import {
  availableStock,
  countActiveQuantityByType,
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
 *    hug the bottom even when content is shorter than the viewport.
 *    **Correction (business-owner finding, post-launch-audit):** this
 *    block originally added `pb-20` (80px) on the scrollable content,
 *    reasoning the CTA bar would otherwise sit on top of the last
 *    `RentalCard`. That was wrong — the CTA is a normal flex sibling
 *    (not `position: fixed`/absolute), so it always reserves its own
 *    80px of layout space regardless of padding, exactly like
 *    `AppLayout.tsx`'s own bottom nav already documents ("no `pb-20`
 *    -style compensating padding hack is needed anywhere" — same
 *    sticky-flex-sibling pattern). The padding was pure double-spacing:
 *    it never prevented an overlap that couldn't happen, it just left a
 *    visibly oversized empty gap between the last card and the CTA.
 *    Removed; the CTA's own box is the only spacing needed.
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
 * business owner — `domain/rentals/availability.ts`.
 * `listActiveRentalItems()` is fetched alongside `listActiveRentals()` in
 * the same initial load (shared loading/error state — no new surface for a
 * second independent fetch to fail differently).
 *
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced): total stock used to be two build-time
 * env vars (`VITE_TOTAL_CONCENTRADORES`/`VITE_TOTAL_TANQUES`) — now it's
 * `getBusinessSettings()` (PocketBase's `business_settings` singleton
 * collection), fetched in the SAME initial `Promise.all` as
 * `listActiveRentals`/`listActiveRentalItems` (still one shared loading/
 * error state, no new failure surface). `DashboardStats.tsx` owns the
 * tap-to-edit dialog and calls `updateBusinessSettings` itself — its
 * `onSettingsUpdated` callback just updates this screen's own
 * `businessSettings` state so the displayed availability recomputes
 * immediately, no re-fetch of rentals/items and no full page reload.
 */

const SEARCH_DEBOUNCE_MS = 300;

// Post-launch feature (Inicio/Clientes swipe): the search box itself now
// lives once, shared, in `AppLayout` — this screen only owns what it does
// with the typed text (the debounce/results/loading/error state below),
// receiving the text itself as a controlled prop instead of its own
// `useState`. No `onChange`-style prop back out — this screen never
// renders the search input anymore, only reacts to its value. See
// `AppLayout.tsx`'s own docblock for the full picture. Optional/defaulted
// to "" — `App.tsx` still instantiates `<DashboardScreen />` bare as a
// route `element` that's never actually rendered via `<Outlet/>` (only
// used for `useLocation()` path-matching, see `AppLayout.tsx`), so this
// must tolerate being constructed with no props at all.
export interface DashboardScreenProps {
  query?: string;
}

// Runtime-debugging fix (Inicio/Clientes swipe redesign, live-tested via
// Playwright CLI + CDP CPU throttling): `AppLayout` renders both
// `DashboardScreen` and `ClientesScreen` permanently mounted side by side
// (see `AppLayout.tsx`'s own docblock) — neither was memoized, so ANY
// `AppLayout` re-render (a route/pathname change from the swipe settling,
// every keystroke in the shared search box, any `DataCacheContext` state
// tick) forced React to fully reconcile BOTH screens' entire lists (43+
// rental cards and 100+ customer cards against the live dev dataset used
// for this reproduction), even though a pure route switch changes neither
// screen's own `query` prop. That reconciliation work competes with
// Embla's own requestAnimationFrame-driven settle loop for main-thread
// time — confirmed live: under 6x CPU throttling (Chrome DevTools
// Protocol `Emulation.setCPUThrottlingRate`, a standard proxy for a real
// mid/low-end phone), a swipe-release settle that finishes in ~110ms
// unthrottled instead took over 2 seconds to visually reach its final
// resting transform — the exact "se junta unos segundos después" symptom
// reported live, and the same mechanism behind "switching feels slower"
// and the swipe reading as sluggish/animated rather than snappy. (Embla
// v8.6.0 itself has no public option for this: `duration` only affects
// `scrollTo()`-triggered scrolls, not drag-release settle — confirmed by
// reading `node_modules/embla-carousel`'s source; the actual release
// physics use a hardcoded `friction = 0.68` local constant, never read
// from `options`.) Wrapping both screens in `memo()` — they take only a
// primitive `query` prop — makes a pure route/pathname switch a no-op
// render for whichever screen's own data didn't change, freeing the main
// thread for Embla's settle animation.
export const DashboardScreen = memo(function DashboardScreen({
  query = "",
}: DashboardScreenProps) {
  const {
    rentals,
    activeItems,
    businessSettings,
    rentalsError,
    isRefreshingRentals,
    loadRentalsIfNeeded,
    refreshRentals,
    setBusinessSettings,
  } = useDataCache();

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

  useEffect(() => loadRentalsIfNeeded(), [loadRentalsIfNeeded]);

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

  // Redesign — UX/UI pass: a subtle per-card product-type icon
  // (business-owner request, "leve"). Derived from `activeItems` (already
  // fetched for the availability stats above) grouped by `rental_id` —
  // NOT a new fetch. Only rendered when a rental's items are all the same
  // type; a mixed rental (both concentrador and tanque) shows no icon
  // rather than guessing which one to prioritize. `searchRentals` results
  // don't carry item data at all (unchanged, documented limitation) — no
  // icon there either.
  const itemTypesByRentalId = new Map<string, Set<string>>();
  for (const item of activeItems) {
    const types = itemTypesByRentalId.get(item.rental_id) ?? new Set<string>();
    types.add(item.item_type);
    itemTypesByRentalId.set(item.rental_id, types);
  }

  function rentalItemTypeIcon(rentalId: string) {
    const types = itemTypesByRentalId.get(rentalId);
    if (!types || types.size !== 1) {
      return undefined;
    }
    const [onlyType] = types;
    const Icon = onlyType === "concentrator" ? Wind : Droplet;
    return (
      <Icon aria-hidden="true" className="text-muted-foreground size-4" />
    );
  }

  const activeQuantities = countActiveQuantityByType(activeItems);
  const totalConcentradores = businessSettings?.total_concentradores ?? 0;
  const totalTanques = businessSettings?.total_tanques ?? 0;
  const concentradoresDisponibles = availableStock(
    totalConcentradores,
    activeQuantities.concentrator,
  );
  const tanquesDisponibles = availableStock(
    totalTanques,
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
    <div className="flex flex-1 min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-6 px-4 pt-2">

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
                      phone={rental.expand?.customer_id?.phone}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {rentalsError && (
              <p className="text-destructive text-sm">{rentalsError}</p>
            )}

            {rentals === null && !rentalsError && (
              <p className="text-muted-foreground text-sm">Cargando…</p>
            )}

            {rentals !== null && (
              <>
                <DashboardStats
                  activeRentalsCount={rentals.length}
                  concentradoresDisponibles={concentradoresDisponibles}
                  tanquesDisponibles={tanquesDisponibles}
                  totalConcentradores={totalConcentradores}
                  totalTanques={totalTanques}
                  onSettingsUpdated={setBusinessSettings}
                  isRefreshing={isRefreshingRentals}
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
                  <EmptyState
                    icon={PackageOpen}
                    title="No hay rentas activas todavía."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {visibleActiveRentals.map((rental, index) => (
                      <li
                        key={rental.id}
                        className="animate-card-enter"
                        style={{
                          animationDelay: `${Math.min(index, 8) * 40}ms`,
                        }}
                      >
                        <RentalCard
                          customerName={
                            rental.expand?.customer_id?.name ?? "Cliente"
                          }
                          status={rental.status}
                          folio={rental.folio}
                          onClick={() => openRentalDetail(rental.id)}
                          phone={rental.expand?.customer_id?.phone}
                          itemTypeIcon={rentalItemTypeIcon(rental.id)}
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
                          <p className="flex items-center gap-1.5">
                            <CalendarDays aria-hidden="true" className="size-3.5" />
                            {new Date(rental.created).toLocaleDateString(
                              "es-MX",
                            )}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <CircleDollarSign aria-hidden="true" className="size-3.5" />
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
          onRentalChanged={refreshRentals}
        />
        <CustomerDetailSheet
          open={customerDetailOpen}
          onOpenChange={setCustomerDetailOpen}
          customerId={selectedCustomerId}
          onCustomerChanged={refreshRentals}
        />
      </div>

      <div className="sticky bottom-0 z-10 mt-auto shrink-0 p-4 pointer-events-none">
        <Button asChild size="lg" className="w-full pointer-events-auto shadow-lg">
          <Link to="/nueva-renta">
            <Plus aria-hidden="true" />
            Nueva renta
          </Link>
        </Button>
      </div>
    </div>
  );
});
