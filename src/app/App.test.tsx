import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/App";

// Both real tabs behind the nav now fetch data on mount (DashboardScreen,
// task 2.5; SearchScreen, task 2.6) — mocked here so this smoke test stays
// a fast, network-free check of the route wiring itself (§16.5), not a
// screen-level test (those live in each screen's own *.test.tsx).
const listActiveRentals = vi.fn();
const searchRentals = vi.fn();
const getLoginDirectory = vi.fn();

vi.mock("@/data/rentals.repo", () => ({
  listActiveRentals: (...args: unknown[]) => listActiveRentals(...args),
  searchRentals: (...args: unknown[]) => searchRentals(...args),
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
      clear: vi.fn(),
    },
  },
}));

describe("App", () => {
  beforeEach(() => {
    listActiveRentals.mockReset().mockResolvedValue([]);
    searchRentals.mockReset().mockResolvedValue([]);
    getLoginDirectory.mockReset().mockResolvedValue([]);
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
});
