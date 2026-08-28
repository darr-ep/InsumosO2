import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";

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
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief):
 * `AppLayout` is now pure chrome — no header, no account menu of its own.
 * That behavior (the account menu trigger, Historial/Cerrar sesión items,
 * `logout()`+navigate) was extracted verbatim into `AccountMenu`, composed
 * by `AppHeader` per-screen instead — its own ported test coverage now
 * lives in `AccountMenu.test.tsx`. This file only proves `AppLayout` still
 * renders the routed `Outlet` content and nothing else.
 */
describe("AppLayout (Redesign Round 2, Batch 1: pure chrome)", () => {
  it("renders routed content inside <main>, with no header/account menu of its own", () => {
    renderLayout();

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cuenta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Navegación principal" }),
    ).not.toBeInTheDocument();
  });
});
