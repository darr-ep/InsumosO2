import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientResponseError } from "pocketbase";
import { App } from "@/app/App";
import { STALE_SESSION_MESSAGE } from "@/data/staleSession";

// DashboardScreen fetches active rentals (and, once folded, search results)
// on mount/query — mocked here so this smoke test stays a fast,
// network-free check of the route wiring itself (§16.5), not a
// screen-level test (those live in each screen's own *.test.tsx).
//
// Redesign Round 2, Batch 1 (Header Pattern): DashboardScreen's own <h1>
// text is now literally the `VITE_BUSINESS_NAME` env var (falling back to
// "Inicio" when unset) instead of a hardcoded "Dashboard" — the test env
// has no `VITE_BUSINESS_NAME`, so every "Dashboard" heading assertion
// below was updated to "Inicio" to match what actually renders.
const listActiveRentals = vi.fn();
const searchRentals = vi.fn();
const listReturnedRentals = vi.fn();
const getLoginDirectory = vi.fn();
const createCustomer = vi.fn();
const searchCustomers = vi.fn();
const listCustomers = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
  listReturnedRentals: (...args: unknown[]) => listReturnedRentals(...args),
}));

vi.mock("@/data/customers.repo", () => ({
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
  listCustomers: (...args: unknown[]) => listCustomers(...args),
}));

vi.mock("@/data/auth.repo", () => ({
  getLoginDirectory: (...args: unknown[]) => getLoginDirectory(...args),
  loginWithPassword: vi.fn(),
}));

// Gap-fill fix (§14): App.tsx now gates the 3 authenticated routes behind
// `pb.authStore.isValid` and reacts live to `pb.authStore.onChange`. Every
// test in this file controls that state explicitly instead of relying on
// the real (unmocked) authStore, which would always be `isValid: false` in
// a fresh jsdom environment with no persisted token.
let isValidState = false;
let changeListener: (() => void) | null = null;

vi.mock("@/data/pocketbaseClient", () => ({
  pb: {
    authStore: {
      get isValid() {
        return isValidState;
      },
      onChange: (callback: () => void) => {
        changeListener = callback;
        return () => {};
      },
      // §14 gap-fill: mirrors real `pb.authStore.clear()` behavior — it
      // both flips local state AND notifies subscribers, which is what
      // makes `RequireAuth` react live to a stale-session redirect.
      clear: vi.fn(() => {
        isValidState = false;
        changeListener?.();
      }),
    },
  },
}));

describe("App", () => {
  beforeEach(() => {
    listActiveRentals.mockReset().mockResolvedValue([]);
    searchRentals.mockReset().mockResolvedValue([]);
    listReturnedRentals.mockReset().mockResolvedValue([]);
    getLoginDirectory.mockReset().mockResolvedValue([]);
    createCustomer.mockReset();
    searchCustomers.mockReset();
    listCustomers.mockReset().mockResolvedValue([]);
    isValidState = true;
    changeListener = null;
  });

  describe("authenticated (§14, §16.5)", () => {
    it("redirects to the Dashboard tab and renders without a bottom tab bar (redesign nav batch)", async () => {
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Inicio" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Navegación principal" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cuenta" }),
      ).toBeInTheDocument();
    });

    it("wires the Dashboard tab's real content, not the Phase 0 placeholder (task 2.5/2.7)", async () => {
      render(<App />);

      expect(
        await screen.findByText("No hay rentas activas todavía."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
    });

    it("navigates to /historial via the account menu and renders the real Historial screen, not a placeholder (redesign nav batch)", async () => {
      window.history.pushState({}, "", "/dashboard");
      const user = userEvent.setup();
      render(<App />);

      await screen.findByText("No hay rentas activas todavía.");
      await user.click(screen.getByRole("button", { name: "Cuenta" }));
      await user.click(screen.getByRole("menuitem", { name: "Historial" }));

      expect(
        await screen.findByRole("heading", { name: "Historial de rentas" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
    });

    it("renders the real Clientes screen at /clientes (Redesign Round 2, Batch 2 — reachable by URL, bottom-nav wiring is a later batch)", async () => {
      window.history.pushState({}, "", "/clientes");
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Clientes" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Volver" }),
      ).not.toBeInTheDocument();
    });

    it("redirects /login to /dashboard when already authenticated (gap-fill, §14)", async () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Inicio" }),
      ).toBeInTheDocument();
    });

    it("mounts a single Toaster at the app root (§16.13/§17, gap-fill finding 4)", async () => {
      render(<App />);

      await screen.findByRole("heading", { name: "Inicio" });

      // Sonner's own accessible landmark — proves the notification region
      // is actually mounted in the DOM, not just imported.
      expect(
        screen.getByRole("region", { name: /Notifications/ }),
      ).toBeInTheDocument();
    });
  });

  describe("unauthenticated (gap-fill, §14 — route guard)", () => {
    beforeEach(() => {
      isValidState = false;
    });

    it("redirects /dashboard to /login when there is no valid session", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      // LoginScreen's own scaffold heading proves we actually landed there.
      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Inicio" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Navegación principal" }),
      ).not.toBeInTheDocument();
    });

    it("redirects /nueva-renta to /login when there is no valid session", async () => {
      window.history.pushState({}, "", "/nueva-renta");
      render(<App />);

      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Nueva renta" }),
      ).not.toBeInTheDocument();
    });

    it("redirects /historial to /login when there is no valid session (redesign nav batch: new route needs the same RequireAuth coverage)", async () => {
      window.history.pushState({}, "", "/historial");
      render(<App />);

      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Historial de rentas" }),
      ).not.toBeInTheDocument();
    });

    it("redirects /clientes to /login when there is no valid session (Redesign Round 2, Batch 2: new route needs the same RequireAuth coverage)", async () => {
      window.history.pushState({}, "", "/clientes");
      render(<App />);

      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Clientes" }),
      ).not.toBeInTheDocument();
    });

    it("reacts live to a login (authStore change) without a full reload", async () => {
      window.history.pushState({}, "", "/dashboard");
      render(<App />);

      await screen.findByText("Insumos O2");

      isValidState = true;
      act(() => {
        changeListener?.();
      });

      expect(
        await screen.findByRole("heading", { name: "Inicio" }),
      ).toBeInTheDocument();
    });
  });

  describe("stale session (§14 gap-fill — real live bug: 'Crear cliente' failing with a rotated tokenKey)", () => {
    it("redirects from Nueva renta to /login with the session-expired message when creating a customer fails with a stale-session-shaped error", async () => {
      createCustomer.mockRejectedValueOnce(
        new ClientResponseError({
          status: 400,
          response: { message: "Failed to create record.", data: {} },
        }),
      );
      window.history.pushState({}, "", "/nueva-renta");
      const user = userEvent.setup();
      render(<App />);

      await screen.findByRole("heading", { name: "Nueva renta" });

      await user.click(screen.getByRole("button", { name: "Cliente nuevo" }));
      await user.type(screen.getByLabelText("Nombre"), "Darrell");
      await user.type(screen.getByLabelText("Teléfono"), "5512345678");
      await user.click(screen.getByRole("button", { name: "Crear cliente" }));

      // Redirected to /login, not left on a confusing generic error.
      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Nueva renta" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("No se pudo guardar el cliente. Intenta de nuevo."),
      ).not.toBeInTheDocument();
      expect(await screen.findByText(STALE_SESSION_MESSAGE)).toBeInTheDocument();
    });

    it("does NOT redirect and keeps the generic error visible when creating a customer fails with a normal (non-stale-session) error", async () => {
      createCustomer.mockRejectedValueOnce(new Error("network down"));
      window.history.pushState({}, "", "/nueva-renta");
      const user = userEvent.setup();
      render(<App />);

      await screen.findByRole("heading", { name: "Nueva renta" });

      await user.click(screen.getByRole("button", { name: "Cliente nuevo" }));
      await user.type(screen.getByLabelText("Nombre"), "Darrell");
      await user.type(screen.getByLabelText("Teléfono"), "5512345678");
      await user.click(screen.getByRole("button", { name: "Crear cliente" }));

      expect(
        await screen.findByText("No se pudo guardar el cliente. Intenta de nuevo."),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Nueva renta" }),
        ).toBeInTheDocument(),
      );
    });
  });
});
