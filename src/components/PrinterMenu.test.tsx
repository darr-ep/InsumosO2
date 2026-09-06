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

    // Radix closes the menu on selection — reopen to inspect the new state.
    await user.click(
      screen.getByRole("button", { name: "Impresora desconectada" }),
    );
    expect(
      screen.getByRole("switch", { name: /auto-imprimir/i }),
    ).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("menuitem", { name: /auto-imprimir/i }));
    await user.click(
      screen.getByRole("button", { name: "Impresora desconectada" }),
    );
    expect(
      screen.getByRole("switch", { name: /auto-imprimir/i }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
