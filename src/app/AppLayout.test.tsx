import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";

function renderLayout(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<p>Dashboard content</p>} />
          <Route path="/clientes" element={<p>Clientes content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Redesign Round 2, Batch 1 (Header Pattern, business-owner brief):
 * `AppLayout` is now pure chrome — no header, no account menu of its own.
 * That behavior (the account menu trigger, Cerrar sesión item,
 * `logout()`+navigate) was extracted verbatim into `AccountMenu`, composed
 * by `AppHeader` per-screen instead — its own ported test coverage now
 * lives in `AccountMenu.test.tsx`. This file only proves `AppLayout` still
 * renders the routed `Outlet` content and nothing else on top.
 */
describe("AppLayout (Redesign Round 2, Batch 1: pure chrome)", () => {
  it("renders routed content inside <main>, with no header/account menu of its own", () => {
    renderLayout();

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cuenta" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Redesign Round 2, Batch 3: Bottom Nav Wiring (business-owner brief,
 * verbatim): "No usar la barra inferior actual con Dashboard/Nueva
 * renta/Buscar. Sí quiero una barra inferior mínima con únicamente:
 * Inicio, Clientes. Nueva renta se accede mediante el CTA principal.
 * Buscar se accede mediante el buscador. No agregar más elementos a la
 * navegación primaria." This replaces the prior "no bottom bar" assertion
 * (from the earlier nav-removal redesign batch) with real coverage of the
 * reintroduced 2-item bar: exactly 2 items, correct hrefs, real navigation
 * on click, and correct active-state styling driven by the current route.
 */
describe("AppLayout (Redesign Round 2, Batch 3: bottom nav — Inicio/Clientes only)", () => {
  it("renders exactly 2 nav items — Inicio and Clientes — with the correct hrefs", () => {
    renderLayout();

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });
    const links = within(nav).getAllByRole("link");

    expect(links).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("href", "/clientes");
  });

  it("marks Inicio as the active tab when the current route is /dashboard", () => {
    renderLayout("/dashboard");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Clientes as the active tab when the current route is /clientes", () => {
    renderLayout("/clientes");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("navigates to Clientes when its tab is tapped, updating the active state", async () => {
    const user = userEvent.setup();
    renderLayout("/dashboard");

    const nav = screen.getByRole("navigation", {
      name: "Navegación principal",
    });

    await user.click(within(nav).getByRole("link", { name: "Clientes" }));

    expect(screen.getByText("Clientes content")).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).not.toHaveAttribute("aria-current");
  });
});
