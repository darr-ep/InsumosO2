import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientResponseError } from "pocketbase";
import { App } from "@/app/App";
import { STALE_SESSION_MESSAGE } from "@/data/staleSession";

// Both real tabs behind the nav now fetch data on mount (DashboardScreen,
// task 2.5; SearchScreen, task 2.6) — mocked here so this smoke test stays
// a fast, network-free check of the route wiring itself (§16.5), not a
// screen-level test (those live in each screen's own *.test.tsx).
const listActiveRentals = vi.fn();
const searchRentals = vi.fn();
const getLoginDirectory = vi.fn();
const createCustomer = vi.fn();
const searchCustomers = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
}));

vi.mock("@/data/customers.repo", () => ({
  createCustomer: (...args: unknown[]) => createCustomer(...args),
  searchCustomers: (...args: unknown[]) => searchCustomers(...args),
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
    getLoginDirectory.mockReset().mockResolvedValue([]);
    createCustomer.mockReset();
    searchCustomers.mockReset();
    isValidState = true;
    changeListener = null;
  });

  describe("authenticated (§14, §16.5)", () => {
    it("redirects to the Dashboard tab and renders the 3-tab nav", async () => {
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
      const nav = screen.getByRole("navigation", {
        name: "Navegación principal",
      });
      expect(nav).toBeInTheDocument();
      expect(
        within(nav).getByRole("link", { name: /Dashboard/ }),
      ).toBeInTheDocument();
      expect(
        within(nav).getByRole("link", { name: /Nueva renta/ }),
      ).toBeInTheDocument();
      expect(
        within(nav).getByRole("link", { name: /Buscar/ }),
      ).toBeInTheDocument();
    });

    it("wires the Dashboard tab's real content, not the Phase 0 placeholder (task 2.5/2.7)", async () => {
      render(<App />);

      expect(
        await screen.findByText("No hay rentas activas todavía."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
    });

    it("wires the Buscar tab's real content, not the Phase 0 placeholder (task 2.6/2.7)", async () => {
      const user = userEvent.setup();
      render(<App />);

      await screen.findByText("No hay rentas activas todavía.");
      await user.click(screen.getByRole("link", { name: /Buscar/ }));

      expect(
        await screen.findByLabelText("Buscar por folio, nombre o teléfono"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
    });

    it("redirects /login to /dashboard when already authenticated (gap-fill, §14)", async () => {
      window.history.pushState({}, "", "/login");
      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Dashboard" }),
      ).toBeInTheDocument();
    });

    it("mounts a single Toaster at the app root (§16.13/§17, gap-fill finding 4)", async () => {
      render(<App />);

      await screen.findByRole("heading", { name: "Dashboard" });

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
        screen.queryByRole("heading", { name: "Dashboard" }),
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

    it("redirects /buscar to /login when there is no valid session", async () => {
      window.history.pushState({}, "", "/buscar");
      render(<App />);

      expect(await screen.findByText("Insumos O2")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Buscar por folio, nombre o teléfono"),
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
        await screen.findByRole("heading", { name: "Dashboard" }),
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
