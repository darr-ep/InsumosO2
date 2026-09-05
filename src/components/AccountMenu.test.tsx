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
 * el buscador del Dashboard + historial por cliente).
 *
 * New gap-fill feature: Self-Service Profile Screen (business owner
 * request, post-Phase-5) — "Perfil" added above "Cerrar sesión".
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

  it("opens the menu to reveal exactly Perfil and Cerrar sesión, in that order", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Perfil");
    expect(items[1]).toHaveTextContent("Cerrar sesión");
  });

  it("navigates to /perfil when Perfil is tapped", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Perfil" }));

    expect(navigate).toHaveBeenCalledWith("/perfil");
  });

  it("shows a confirmation dialog before logging out, and does not log out until confirmed (design-fidelity #4, obs #2221/#2223/#2224)", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(
      screen.getByRole("heading", { name: "¿Cerrar sesión?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tendrás que volver a escribir tu contraseña para entrar de nuevo.",
      ),
    ).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith("/login");
  });

  it("cancelling the confirmation dialog does not log out (design-fidelity, sibling-render pattern)", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByRole("heading", { name: "¿Cerrar sesión?" }),
    ).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("clears the session and redirects to /login when Cerrar sesión is confirmed", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await user.click(screen.getByRole("button", { name: "Sí, cerrar sesión" }));

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
