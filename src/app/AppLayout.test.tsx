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
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * SDD.md §14 — "logout manual disponible" — Gap-fill fix (found
 * post-Phase-5): no logout action existed anywhere in the codebase before
 * this.
 */
describe("AppLayout — logout (§14, gap-fill)", () => {
  beforeEach(() => {
    logout.mockReset();
    navigate.mockReset();
  });

  it("renders a reachable logout action in the chrome", () => {
    renderLayout();

    expect(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    ).toBeInTheDocument();
  });

  it("clears the session and redirects to /login when tapped", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
