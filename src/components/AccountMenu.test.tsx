import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AccountMenu } from "@/components/AccountMenu";

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

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<AccountMenu />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Redesign Round 2, Batch 1 (Header Pattern): `AccountMenu` was extracted
 * verbatim out of `AppLayout` so `AppHeader`'s home variant can compose it.
 *
 * Redesign Round 3, punto 6: el ítem "Historial" se quitó (redundante con
 * el buscador del Dashboard + historial por cliente) — solo queda
 * Cerrar sesión.
 */
describe("AccountMenu (extracted from AppLayout, Redesign Round 2 Batch 1: Header Pattern)", () => {
  beforeEach(() => {
    logout.mockReset();
    navigate.mockReset();
  });

  it("renders a reachable account menu trigger", () => {
    renderMenu();

    expect(
      screen.getByRole("button", { name: "Cuenta" }),
    ).toBeInTheDocument();
  });

  it("opens the menu to reveal exactly Cerrar sesión", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));

    expect(
      screen.getByRole("menuitem", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("clears the session and redirects to /login when Cerrar sesión is tapped", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
