import { useEffect, useRef } from "react";
import PullToRefresh from "pulltorefreshjs";

/**
 * Replaces the hand-rolled `usePullToRefresh` (raw touch-event math) after
 * two rounds of live-reported jank ("se traba" both starting the gesture
 * and while dragging) that manual fixes didn't fully resolve — the owner
 * asked directly whether a dedicated library existed for this. `pulltorefreshjs`
 * (docs fetched live via context7, not assumed) is a small, dependency-free,
 * battle-tested library purpose-built for exactly this gesture.
 *
 * Trade-off, stated plainly: this library's public API has no "live pull
 * distance" callback — no way to drive a fully custom, Tailwind-styled,
 * proportionally-animated indicator the way the old hand-rolled hook's
 * `pullDistance` did (confirmed by reading its source, not just its docs —
 * `getMarkup`/`getStyles` let you replace its DEFAULT indicator markup/CSS,
 * but the live drag-distance itself is never exposed to application code,
 * only threshold-crossing/release/refreshing STATE via CSS classes it
 * toggles on its own injected element). Kept the library's own default
 * indicator (a small pull arrow that rotates past the threshold) rather
 * than fighting its API to fake a custom one — restyled via the
 * `.ptr--*` CSS overrides in `src/index.css` to use this app's own
 * `--muted-foreground` token and Spanish copy, so it reads as part of the
 * app rather than a foreign widget, even though it's not pixel-identical
 * to the old `RefreshCw`-icon indicator.
 *
 * Multiple, independently-targeted instances (one per swipeable panel,
 * `AppLayout.tsx`) — the library supports this natively (`mainElement` is
 * just a CSS selector per `init()` call; its own docs show exactly this
 * "two independent instances on one page" pattern). Both instances are
 * created ONCE on mount (both panels are permanently mounted per the
 * Inicio/Clientes swipe design — see `AppLayout.tsx`'s own docblock) and
 * never re-initialized; `shouldPullToRefresh` and `onRefresh` read
 * `activePanel`/`onRefresh` from refs instead of closing over the values
 * from init time, so only the currently-active panel's pull actually
 * triggers a refresh (and the inactive one is inert), without the
 * destroy/recreate churn re-initializing on every single swipe would cost.
 *
 * `mainElement` deliberately targets a wrapper INSIDE each panel
 * (`dashboardContentId`/`clientesContentId`), never the panel id itself —
 * confirmed live (real touch pull via CDP, DOM snapshot of the injected
 * `.ptr--ptr` node): this library always inserts its indicator as
 * `mainElement.parentNode.insertBefore(ptr, mainElement)` (read from its
 * source, not assumed). The panel ids are Embla SLIDES — direct children
 * of Embla's own flex container — so pointing `mainElement` at a panel
 * would insert the indicator as a THIRD sibling in that row: squeezed to
 * 0 width by the two `shrink-0` slides (confirmed via
 * `getBoundingClientRect()` on the live node — it grew its `min-height`
 * correctly but had zero width, hence fully invisible), and — worse —
 * Embla's own `SlidesHandler` watches the container for child mutations
 * and auto-`reInit()`s on them, so it would also start treating the
 * indicator as a real third slide. Targeting a plain wrapper DIV one
 * level further in sidesteps both: the indicator lands inside the panel's
 * normal block-flow content (full width, visible) and never touches
 * Embla's own container. `triggerElement`/`shouldPullToRefresh` still key
 * off the panel id — that's the actual scrollable element whose
 * `scrollTop` decides whether a pull should start.
 */
export interface UsePanelPullToRefreshOptions {
  dashboardPanelId: string;
  clientesPanelId: string;
  dashboardContentId: string;
  clientesContentId: string;
  activePanel: 0 | 1;
  onRefresh: () => Promise<void>;
}

const SHARED_OPTIONS = {
  distThreshold: 60,
  distMax: 80,
  distReload: 50,
  instructionsPullToRefresh: "Desliza para actualizar",
  instructionsReleaseToRefresh: "Suelta para actualizar",
  instructionsRefreshing: "Actualizando…",
  getStyles: () => "",
};

export function usePanelPullToRefresh({
  dashboardPanelId,
  clientesPanelId,
  dashboardContentId,
  clientesContentId,
  activePanel,
  onRefresh,
}: UsePanelPullToRefreshOptions): void {
  const activePanelRef = useRef(activePanel);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const targets: { panelId: string; contentId: string; panel: 0 | 1 }[] = [
      { panelId: dashboardPanelId, contentId: dashboardContentId, panel: 0 },
      { panelId: clientesPanelId, contentId: clientesContentId, panel: 1 },
    ];

    const instances = targets.map(({ panelId, contentId, panel }) =>
      PullToRefresh.init({
        mainElement: `#${contentId}`,
        triggerElement: `#${panelId}`,
        shouldPullToRefresh: () => {
          if (activePanelRef.current !== panel) {
            return false;
          }
          const element = document.getElementById(panelId);
          return !!element && element.scrollTop === 0;
        },
        onRefresh: () => onRefreshRef.current(),
        ...SHARED_OPTIONS,
      }),
    );

    return () => {
      instances.forEach((instance) => instance.destroy());
    };
    // `dashboardPanelId`/`clientesPanelId`/`dashboardContentId`/
    // `clientesContentId` are stable constants from `AppLayout.tsx` — this
    // only ever runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
