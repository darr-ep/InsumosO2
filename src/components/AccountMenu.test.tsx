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
        <Route path="/historial" element={<p>Historial content</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Redesign Round 2, Batch 1 (Header Pattern): `AccountMenu` was extracted
 * verbatim out of `AppLayout` so `AppHeader`'s home variant can compose it
 * — same trigger, same two items (Historial, Cerrar sesión), same
 * `logout()`+`navigate("/login")` call, zero behavior change. These
 * assertions are ported from the "AppLayout — secondary nav menu (redesign
 * nav batch)" describe block in the previous revision of
 * `AppLayout.test.tsx`, proving the extraction is behavior-preserving.
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

  it("opens the menu to reveal exactly Historial and Cerrar sesión", async () => {
    const user = userEvent.setup();
    renderMenu();

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
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Cuenta" }));
    await user.click(screen.getByRole("menuitem", { name: "Historial" }));

    expect(await screen.findByText("Historial content")).toBeInTheDocument();
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
