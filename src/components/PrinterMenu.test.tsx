import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrinterMenu } from "@/components/PrinterMenu";
import { webBluetoothPrinter } from "@/printing/WebBluetoothPrinter";

/**
 * design-fidelity post-audit bugfix batch, Fix 4 (pencil frame `MenúImpresora`):
 * "Auto-imprimir" is a real switch/toggle widget (pill track + white knob),
 * not a plain `DropdownMenuItem` that only swaps an icon/trailing text. No
 * new dependency (`@radix-ui/react-switch` explicitly rejected per
 * `package.json` constraints, obs #2224 §C6) — hand-rolled `role="switch"` +
 * `aria-checked`, matching the app's existing hand-built-primitive
 * convention (`ui/segmented-toggle.tsx`'s `role="group"`/`aria-pressed`).
 * Behavior (toggling `printSettings.ts`'s stored preference) is unchanged —
 * only the visual representation changes.
 */
vi.mock("@/printing/WebBluetoothPrinter", () => ({
  webBluetoothPrinter: {
    isAvailable: vi.fn(),
    isConnected: false,
    connectionStatus: "disconnected",
    deviceName: null,
    subscribe: vi.fn(() => () => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
    print: vi.fn(),
    printLogo: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("PrinterMenu (design-fidelity bugfix batch, Fix 4 — real switch widget)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(webBluetoothPrinter.isAvailable).mockReset();
    vi.mocked(webBluetoothPrinter.isAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders a real switch (role=switch) for Auto-imprimir, defaulting to checked (auto-print defaults on)", async () => {
    const user = userEvent.setup();
    render(<PrinterMenu />);

    await user.click(
      await screen.findByRole("button", { name: "Impresora desconectada" }),
    );

    const toggle = screen.getByRole("switch", { name: /auto-imprimir/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("toggles aria-checked to false when Auto-imprimir is tapped, and back to true on a second tap (behavior unchanged, only the visual changes)", async () => {
    const user = userEvent.setup();
    render(<PrinterMenu />);

    await user.click(
      await screen.findByRole("button", { name: "Impresora desconectada" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /auto-imprimir/i }));

    // Bugfix (real-device finding, 2026-09-05): the menu now correctly
    // STAYS OPEN after toggling — see the dedicated test below — so no
    // "reopen" click is needed here anymore.
    expect(
      screen.getByRole("switch", { name: /auto-imprimir/i }),
    ).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("menuitem", { name: /auto-imprimir/i }));
    expect(
      screen.getByRole("switch", { name: /auto-imprimir/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("keeps the dropdown menu open after tapping Auto-imprimir — it's a persistent setting the user may want to watch change state, not a one-shot action that should dismiss the menu (real-device bugfix batch)", async () => {
    const user = userEvent.setup();
    render(<PrinterMenu />);

    await user.click(
      await screen.findByRole("button", { name: "Impresora desconectada" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /auto-imprimir/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /auto-imprimir/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("renders 'Impresión de logo' when connected and calls printLogo on tap", async () => {
    vi.mocked(webBluetoothPrinter.connectionStatus as unknown as string);
    (webBluetoothPrinter as unknown as { connectionStatus: string }).connectionStatus = "connected";
    const user = userEvent.setup();
    render(<PrinterMenu />);

    await user.click(
      await screen.findByRole("button", { name: "Impresora lista" }),
    );

    const logoItem = screen.getByRole("menuitem", { name: /impresión de logo/i });
    expect(logoItem).toBeInTheDocument();

    await user.click(logoItem);
    expect(webBluetoothPrinter.printLogo).toHaveBeenCalledTimes(1);
    (webBluetoothPrinter as unknown as { connectionStatus: string }).connectionStatus = "disconnected";
  });
});
