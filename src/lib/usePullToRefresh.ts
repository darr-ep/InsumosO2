import { useEffect, useRef, useState, type RefObject } from "react";

const MAX_PULL_DISTANCE = 96;
const REFRESH_THRESHOLD = 64;
const PULL_RESISTANCE = 0.5;

export interface UsePullToRefreshResult {
  pullDistance: number;
  isRefreshing: boolean;
}

/**
 * Touch listeners are attached directly to `containerRef.current` (never
 * `document`): Radix Sheet/Dialog overlays are portals stacked above this
 * element, so a touch starting on an open overlay never reaches these
 * listeners in the first place — no "is an overlay open" flag needed.
 *
 * A pull only starts when the container is already scrolled to the top
 * (`scrollTop === 0`) at `touchstart`, so this never fights normal list
 * scrolling.
 */
export function usePullToRefresh(
  containerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    function updatePullDistance(value: number) {
      pullDistanceRef.current = value;
      setPullDistance(value);
    }

    function handleTouchStart(event: TouchEvent) {
      startYRef.current =
        element!.scrollTop === 0 ? event.touches[0].clientY : null;
    }

    function handleTouchMove(event: TouchEvent) {
      if (startYRef.current === null) {
        return;
      }

      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        updatePullDistance(0);
        return;
      }

      event.preventDefault();
      updatePullDistance(Math.min(delta * PULL_RESISTANCE, MAX_PULL_DISTANCE));
    }

    function handleTouchEnd() {
      if (startYRef.current === null) {
        return;
      }
      startYRef.current = null;

      if (pullDistanceRef.current >= REFRESH_THRESHOLD) {
        setIsRefreshing(true);
        onRefreshRef.current().finally(() => {
          setIsRefreshing(false);
          updatePullDistance(0);
        });
      } else {
        updatePullDistance(0);
      }
    }

    element.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    element.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    element.addEventListener("touchend", handleTouchEnd);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [containerRef]);

  return { pullDistance, isRefreshing };
}
