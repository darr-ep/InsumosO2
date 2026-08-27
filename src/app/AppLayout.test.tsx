import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";

const logout = vi.fn();
const navigate = vi.fn();

vi.mock("@/data/auth.repo", () => ({
  logout: (...args: unknown[]) => logout(...args),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<p>Dashboard content</p>} />
          <Route path="/historial" element={<p>Historial content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * SDD.md §14 — "logout manual disponible" — Gap-fill fix (found
 * post-Phase-5): no logout action existed anywhere in the codebase before
 * this.
 *
 * Redesign nav batch (business-owner brief, round 2): the fixed bottom
 * 3-tab bar is gone — Dashboard is the center of the app and there is no
 * bottom nav at all. Secondary navigation (Historial, Cerrar sesión) now
 * lives behind a single account menu trigger in the header, per the brief's
 * "Para navegación secundaria puede existir únicamente el acceso al
 * usuario/cerrar sesión y, si resulta necesario, acceso al historial."
 */
describe("AppLayout — secondary nav menu (redesign nav batch)", () => {
  beforeEach(() => {
    logout.mockReset();
    navigate.mockReset();
  });

  it("renders no bottom tab bar", () => {
    renderLayout();

    expect(
      screen.queryByRole("navigation", { name: "Navegación principal" }),
    ).not.toBeInTheDocument();
  });

  it("renders a reachable account menu trigger in the header", () => {
    renderLayout();

    expect(
      screen.getByRole("button", { name: "Cuenta" }),
    ).toBeInTheDocument();
  });

  it("opens the menu to reveal exactly Historial and Cerrar sesión", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));

    expect(
      screen.getByRole("menuitem", { name: "Historial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("navigates to /historial when Historial is tapped", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Historial" }));

    expect(await screen.findByText("Historial content")).toBeInTheDocument();
  });

  it("clears the session and redirects to /login when Cerrar sesión is tapped", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
