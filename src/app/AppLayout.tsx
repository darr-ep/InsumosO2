import { Fragment, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { Home, Plus, Users } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/utils";
import { useDataCache } from "@/app/DataCacheContext";
import { usePanelPullToRefresh } from "@/lib/usePanelPullToRefresh";
import { AppHeader } from "@/components/AppHeader";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import { DashboardScreen } from "@/screens/dashboard/DashboardScreen";
import { ClientesScreen } from "@/screens/clientes/ClientesScreen";

/**
 * Redesign Round 2, Batch 3: Bottom Nav Wiring (business-owner brief,
 * verbatim): "No usar la barra inferior actual con Dashboard/Nueva
 * renta/Buscar. Sí quiero una barra inferior mínima con únicamente:
 * Inicio, Clientes. Nueva renta se accede mediante el CTA principal.
 * Buscar se accede mediante el buscador. No agregar más elementos a la
 * navegación primaria." Exactly 2 primary destinations — do not add more.
 *
 * design-fidelity Slice D2 (2026-09-05, design obs #2224 §D2): the brief
 * above still holds verbatim — `TABS` below still enumerates exactly the
 * same 2 primary destinations it always did. The bottom nav itself gained
 * a third, CENTER element — a "Nueva renta" call-to-action linking to
 * `/nueva-renta` — but it is deliberately NOT a third destination in this
 * list: it's an action shortcut into the wizard, not a place the user
 * "is" while using the app. It renders directly in the `<nav>` JSX below,
 * outside `TABS`, non-flexing, with no active/`aria-current` state, so
 * the two real destinations keep equal `flex-1` width on either side of
 * it.
 */
const TABS = [
  { to: "/dashboard", label: "Inicio", icon: Home },
  { to: "/clientes", label: "Clientes", icon: Users },
] as const;

const DASHBOARD_PANEL_ID = "app-layout-dashboard-panel";
const CLIENTES_PANEL_ID = "app-layout-clientes-panel";
// Separate from the panel ids on purpose — see `usePanelPullToRefresh.ts`'s
// docblock for why `pulltorefreshjs`'s injected indicator must land on one
// of these, never directly on a panel id (an Embla slide).
const DASHBOARD_CONTENT_ID = "app-layout-dashboard-content";
const CLIENTES_CONTENT_ID = "app-layout-clientes-content";

/**
 * Root chrome for the authenticated area.
 *
 * Post-launch feature (business-owner request): Inicio and Clientes are
 * swipeable, like a two-page carousel, with a header/search/bottom-nav that
 * never visibly remount or flash mid-swipe. `AppHeader` and `SearchBar` are
 * rendered ONCE here, shared — genuinely fixed chrome, never inside either
 * swiping panel (a prior version duplicated them per-screen; the owner's
 * explicit preference is one shared instance, kept as-is here).
 *
 * Second post-launch revision: the swipe itself and pull-to-refresh were
 * both originally hand-rolled (raw `overflow-x-auto`/`scroll-snap` +
 * manual scroll-position math for the swipe; raw touch-event math for the
 * pull). After two rounds of manually patching real jank bugs in both, the
 * owner tested live again and reported the swipe "no sirve o no es
 * usable" and pull-to-refresh "todavía se siente lento" — confirmation
 * that hand-rolling gesture physics correctly is genuinely hard, not that
 * the specific bugs found so far were the only ones. Both are now backed
 * by dedicated, battle-tested libraries instead:
 *   - `embla-carousel-react` (docs fetched live via context7, not
 *     assumed) drives the swipe. Its own documented pattern for "a
 *     horizontal carousel with vertically-scrollable content inside each
 *     slide" is `touch-action: pan-y pinch-zoom` on the viewport — applied
 *     below — which lets the browser handle vertical scrolling/pulling
 *     natively while Embla's own pointer-event drag detection owns the
 *     horizontal axis, instead of two competing hand-rolled touch
 *     handlers guessing at each other.
 *   - `usePanelPullToRefresh` (`src/lib/usePanelPullToRefresh.ts`) wraps
 *     `pulltorefreshjs` — see that file's own docblock for why a full
 *     custom-Tailwind-UI replacement wasn't possible with this library's
 *     public API, and what was kept/traded off.
 *
 * The swipeable BODY still works the same way as before: `DashboardScreen`
 * and `ClientesScreen` are imported and rendered directly (not via
 * `<Outlet/>`), permanently mounted side by side — neither screen's tree
 * is ever destroyed by swiping between them. `DataCacheContext` already
 * handles cross-screen data staying warm (its own docblock: it was built
 * specifically because these two screens used to unmount on navigation),
 * so having both mounted from the start doesn't introduce a new fetch
 * problem — `loadRentalsIfNeeded`/`loadCustomersIfNeeded` are already
 * idempotent no-ops once loaded.
 *
 * Search: `query` is a single piece of state owned here, passed down to
 * both `DashboardScreen`/`ClientesScreen` as a plain controlled prop —
 * each screen keeps its OWN debounce/results/loading/error state and
 * search call (`searchRentals`/`searchCustomers` are different endpoints,
 * different result shapes) exactly as before, just reading `query` from a
 * prop instead of its own `useState`. Both screens' debounce effects fire
 * on every `query` change regardless of which panel is active — harmless
 * and simpler than gating one of them off.
 *
 * `<Route path="/dashboard" element={<DashboardScreen/>}>`/
 * `<Route path="/clientes" element={<ClientesScreen/>}>` still exist in
 * `App.tsx` (untouched) purely so `useLocation()` correctly resolves
 * `/dashboard` vs `/clientes` for deep-linking and `NavLink`'s
 * active-state — their `element` is never actually rendered via
 * `<Outlet/>` here (this layout renders both screens directly,
 * unconditionally), an intentional, documented trade-off.
 */
export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshRentals, refreshCustomers } = useDataCache();

  const initialIndex = location.pathname === "/clientes" ? 1 : 0;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    startIndex: initialIndex,
  });

  // Derived from the route on every render, NOT from Embla's own 'select'
  // event — the route is the single, synchronously-updated source of
  // truth. An earlier version set this from `emblaApi.on('select', ...)`
  // instead; that meant the header title/active-panel-dependent state only
  // updated once Embla's own scroll ANIMATION visually settled, which (a)
  // lagged a beat behind tapping a bottom-nav tab even in a real browser
  // (the tab shows "active" immediately via `NavLink`, but the header
  // title used to sit on the old text until the swipe animation finished)
  // and (b) never resolved at all inside jsdom's test environment, where
  // Embla's requestAnimationFrame-driven tweening doesn't advance the way
  // it does in a real browser — found via this component's own test suite
  // failing to see the header title update after a simulated tab click.
  const activePanel: 0 | 1 = location.pathname === "/clientes" ? 1 : 0;

  const [query, setQuery] = useState("");

  // A real user-driven SWIPE only tells us anything happened via Embla's
  // own event — sync the URL to match once the swipe settles on a slide.
  // Guarded so it's a no-op when the resolved slide already matches the
  // current route (e.g. this fired from the PROGRAMMATIC `scrollTo` the
  // effect below triggers for a tab tap/deep link, not a real swipe) —
  // otherwise this would immediately re-navigate right back.
  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    function onSelect() {
      const index = emblaApi!.selectedScrollSnap() as 0 | 1;
      const targetPath = index === 1 ? "/clientes" : "/dashboard";
      if (location.pathname === targetPath) {
        return;
      }
      navigate(targetPath, { replace: true });
    }

    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, navigate, location.pathname]);

  // Keep the swipe position in sync with non-swipe navigation (tapping a
  // bottom-nav tab, or a deep link straight to /clientes). Guarded so it's
  // a no-op once Embla is already sitting on the matching slide (e.g.
  // right after the swipe itself caused this exact pathname change via
  // the `navigate(..., {replace:true})` call above) — otherwise this
  // would fight the user's own swipe by re-scrolling back on every render.
  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const targetIndex = location.pathname === "/clientes" ? 1 : 0;
    if (emblaApi.selectedScrollSnap() === targetIndex) {
      return;
    }
    emblaApi.scrollTo(targetIndex);
  }, [emblaApi, location.pathname]);

  // Live-tested finding (not assumed): Embla's `duration` option — per its
  // own docs — only governs API-triggered `scrollTo()`, never a drag
  // release; a release's settle speed is derived purely from drag force
  // (`DragHandler`'s hardcoded `baseSpeed`/friction, read from Embla's own
  // source, v8.6.0). For a real fast flick this resolves to a duration so
  // low it renders the ENTIRE remaining distance in a single frame —
  // confirmed via a live drag probe sampling the container's *computed*
  // transform every animation frame across a release (a real
  // touch-release couldn't be reproduced reliably via CDP in this desktop
  // environment; a mouse drag exercises the identical `DragHandler` code
  // path and reproduced the same single-frame jump). Embla
  // exposes no event that fires before that frame renders, so the release
  // can't be intercepted before the jump happens — but a CSS transition on
  // the SAME element still animates it: the browser compares the
  // last-painted transform to whatever Embla sets next, regardless of how
  // many synchronous JS writes happened in between. Toggled off on
  // `pointerDown` so an active drag still tracks the finger 1:1 (Embla
  // rewrites `transform` every frame while dragging; transitioning that
  // would lag behind the touch). This only wraps how Embla's OWN
  // `transform` value is painted — never sets it — matching Embla's own
  // guidance for adding a transition without fighting its rendering.
  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    const container = emblaApi.containerNode();

    function onPointerDown() {
      container.style.transition = "";
    }

    function onPointerUp() {
      container.style.transition = "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)";
    }

    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    return () => {
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi]);

  const onRefresh = activePanel === 1 ? refreshCustomers : refreshRentals;
  usePanelPullToRefresh({
    dashboardPanelId: DASHBOARD_PANEL_ID,
    clientesPanelId: CLIENTES_PANEL_ID,
    dashboardContentId: DASHBOARD_CONTENT_ID,
    clientesContentId: CLIENTES_CONTENT_ID,
    activePanel,
    onRefresh,
  });

  const isClientesActive = activePanel === 1;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col bg-background text-foreground overflow-hidden">
      <AppHeader
        title={
          isClientesActive
            ? "Clientes"
            : import.meta.env.VITE_BUSINESS_NAME || "Inicio"
        }
        titleClassName={isClientesActive ? "font-bold text-foreground" : "text-primary"}
      />
      <div className="px-4 pb-2">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={isClientesActive ? "Nombre del cliente" : undefined}
        />
      </div>
      {/* Embla's own documented pattern for a horizontal carousel with
          vertically-scrollable content inside each slide (fetched from its
          live docs, not assumed): `touch-action: pan-y pinch-zoom` on the
          viewport lets the browser handle vertical scrolling/pull-to-
          refresh natively, while Embla's pointer-event drag handling owns
          the horizontal swipe — no more hand-rolled gesture-direction
          detection fighting the browser for the same touch. */}
      <div
        ref={emblaRef}
        className="flex-1 overflow-hidden"
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <div className="flex h-full">
          <div
            id={DASHBOARD_PANEL_ID}
            className="h-full min-w-0 shrink-0 grow-0 basis-full overflow-y-auto"
          >
            <div id={DASHBOARD_CONTENT_ID}>
              <DashboardScreen query={query} />
            </div>
          </div>
          <div
            id={CLIENTES_PANEL_ID}
            className="h-full min-w-0 shrink-0 grow-0 basis-full overflow-y-auto"
          >
            <div id={CLIENTES_CONTENT_ID}>
              <ClientesScreen query={query} />
            </div>
          </div>
        </div>
      </div>
      <nav
        aria-label="Navegación principal"
        className="flex shrink-0 items-center border-t bg-card min-h-[70px] px-2"
      >
        {TABS.map(({ to, label, icon: Icon }, index) => (
          <Fragment key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-medium",
                  "min-h-[44px]",
                  isActive
                    ? "text-primary font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{label}</span>
            </NavLink>
            {/* Center CTA sits between the two TABS entries, not flexing —
                see the TABS docblock above for why it isn't a 3rd entry
                in that list. `Fragment` (not a wrapper `div`) so it adds
                no extra DOM node between the two `flex-1` NavLinks. */}
            {index === 0 && (
              <div className="shrink-0 px-2">
                <Button asChild size="lg" className="rounded-full">
                  <Link to="/nueva-renta">
                    <Plus aria-hidden="true" />
                    Nueva renta
                  </Link>
                </Button>
              </div>
            )}
          </Fragment>
        ))}
      </nav>
    </div>
  );
}
