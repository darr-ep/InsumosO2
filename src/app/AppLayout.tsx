import { Outlet } from "react-router";

/**
 * Root chrome for the authenticated area. Redesign Round 2, Batch 1
 * (Header Pattern, business-owner brief): the per-screen title and the
 * account menu both moved into `AppHeader`/`AccountMenu`, composed by each
 * screen itself instead of by this layout — `AppLayout` is now pure chrome
 * with zero header of its own. Do NOT add a bottom nav here — that was
 * removed by the earlier nav redesign batch and stays removed; a bottom
 * nav (if ever reintroduced) is explicitly out of scope for this batch.
 *
 * The `min-h-dvh flex flex-col` wrapper is kept (not literally dropped)
 * because `<main>`'s `flex-1 overflow-y-auto` needs a flex/bounded-height
 * ancestor to actually constrain scrolling — removing it would be a real
 * layout regression, not just chrome. `bg-background text-foreground` are
 * redundant with `body`'s own `@layer base` rule (index.css) but kept for
 * clarity/no behavior change.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
