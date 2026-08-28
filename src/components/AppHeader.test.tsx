import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppHeader } from "@/components/AppHeader";

const navigate = vi.fn();
const logout = vi.fn();

// AppHeader's home variant composes AccountMenu, which calls logout() on
// "Cerrar sesión" — mocked the same way AppLayout.test.tsx/AccountMenu.test.tsx
// already do, even though these tests never click it.
vi.mock("@/data/auth.repo", () => ({
  logout: (...args: unknown[]) => logout(...args),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

function renderHeader(props: { title: string; showBack?: boolean }) {
  return render(
    <MemoryRouter>
      <AppHeader {...props} />
    </MemoryRouter>,
  );
}

/**
 * Redesign Round 2, Batch 1: Header Pattern (business-owner brief,
 * verbatim): "El título 'Dashboard' debe desaparecer del contenido y pasar
 * al navbar. En Dashboard: O2 Insumos/título a la izquierda y perfil a la
 * derecha. En pantallas secundarias: flecha ← + título en el navbar."
 *
 * `title` renders as a real `<h1>` (heading role) so screen-reader/heading
 * hierarchy stays correct now that screens no longer render their own
 * `<h1>` — this is what DashboardScreen/HistorialScreen/RentalNewScreen's
 * updated tests query via `getByRole("heading", ...)`.
 */
describe("AppHeader (Redesign Round 2, Batch 1: Header Pattern)", () => {
  beforeEach(() => {
    navigate.mockReset();
    logout.mockReset();
  });

  describe("home variant (showBack omitted/false)", () => {
    it("renders the title as a heading and the account menu, with no back button", () => {
      renderHeader({ title: "O2 Insumos" });

      expect(
        screen.getByRole("heading", { name: "O2 Insumos" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cuenta" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Volver" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("secondary variant (showBack)", () => {
    it("renders a back button and the title, with no account menu", () => {
      renderHeader({ title: "Historial de rentas", showBack: true });

      expect(
        screen.getByRole("heading", { name: "Historial de rentas" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Volver" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cuenta" }),
      ).not.toBeInTheDocument();
    });

    it("navigates back (history -1) when the back button is tapped", async () => {
      const user = userEvent.setup();
      renderHeader({ title: "Nueva renta", showBack: true });

      await user.click(screen.getByRole("button", { name: "Volver" }));

      expect(navigate).toHaveBeenCalledWith(-1);
    });

    it("meets the project's >=44x44px touch-target convention for the back button (button.tsx's icon size, size-11)", () => {
      renderHeader({ title: "Nueva renta", showBack: true });

      expect(screen.getByRole("button", { name: "Volver" })).toHaveClass(
        "size-11",
      );
    });
  });
});
