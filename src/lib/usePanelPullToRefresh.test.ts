import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PullToRefresh from "pulltorefreshjs";
import { usePanelPullToRefresh } from "@/lib/usePanelPullToRefresh";

vi.mock("pulltorefreshjs", () => ({
  default: {
    init: vi.fn(() => ({ destroy: vi.fn() })),
  },
}));

/**
 * `pulltorefreshjs` itself is a battle-tested, dedicated library (chosen
 * live via context7 docs after two rounds of hand-rolled touch-event jank
 * — see `usePanelPullToRefresh.ts`'s own docblock) — its own gesture
 * handling isn't re-tested here. This only locks in the wrapper's own
 * responsibility: initializing one instance per panel with the right
 * selector, and routing `shouldPullToRefresh`/`onRefresh` through the
 * currently-active panel only.
 */
describe("usePanelPullToRefresh", () => {
  it("targets each panel's inner content id for the indicator, and the panel id for the trigger/scroll check", () => {
    // `mainElement` (where the library inserts its indicator, as a sibling
    // of that element) must never be an Embla slide id directly — see this
    // hook's own docblock. `triggerElement` stays on the actual scrollable
    // panel.
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      usePanelPullToRefresh({
        dashboardPanelId: "dash-panel",
        clientesPanelId: "clientes-panel",
        dashboardContentId: "dash-content",
        clientesContentId: "clientes-content",
        activePanel: 0,
        onRefresh,
      }),
    );

    expect(PullToRefresh.init).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(PullToRefresh.init).mock.calls;
    expect(calls.map((call) => call[0]?.mainElement)).toEqual([
      "#dash-content",
      "#clientes-content",
    ]);
    expect(calls.map((call) => call[0]?.triggerElement)).toEqual([
      "#dash-panel",
      "#clientes-panel",
    ]);
  });

  it("only lets the currently-active panel's shouldPullToRefresh return true", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const dashboardPanel = document.createElement("div");
    dashboardPanel.id = "dash-panel";
    Object.defineProperty(dashboardPanel, "scrollTop", { value: 0 });
    document.body.appendChild(dashboardPanel);

    const clientesPanel = document.createElement("div");
    clientesPanel.id = "clientes-panel";
    Object.defineProperty(clientesPanel, "scrollTop", { value: 0 });
    document.body.appendChild(clientesPanel);

    renderHook(() =>
      usePanelPullToRefresh({
        dashboardPanelId: "dash-panel",
        clientesPanelId: "clientes-panel",
        dashboardContentId: "dash-content",
        clientesContentId: "clientes-content",
        activePanel: 0,
        onRefresh,
      }),
    );

    const calls = vi.mocked(PullToRefresh.init).mock.calls;
    const dashboardOptions = calls.find(
      (call) => call[0]?.triggerElement === "#dash-panel",
    )?.[0];
    const clientesOptions = calls.find(
      (call) => call[0]?.triggerElement === "#clientes-panel",
    )?.[0];

    expect(dashboardOptions?.shouldPullToRefresh?.()).toBe(true);
    expect(clientesOptions?.shouldPullToRefresh?.()).toBe(false);

    document.body.removeChild(dashboardPanel);
    document.body.removeChild(clientesPanel);
  });

  it("destroys both instances on unmount", () => {
    const destroyDashboard = vi.fn();
    const destroyClientes = vi.fn();
    vi.mocked(PullToRefresh.init)
      .mockReturnValueOnce({ destroy: destroyDashboard })
      .mockReturnValueOnce({ destroy: destroyClientes });

    const { unmount } = renderHook(() =>
      usePanelPullToRefresh({
        dashboardPanelId: "dash-panel",
        clientesPanelId: "clientes-panel",
        dashboardContentId: "dash-content",
        clientesContentId: "clientes-content",
        activePanel: 0,
        onRefresh: vi.fn().mockResolvedValue(undefined),
      }),
    );

    unmount();

    expect(destroyDashboard).toHaveBeenCalledTimes(1);
    expect(destroyClientes).toHaveBeenCalledTimes(1);
  });
});
