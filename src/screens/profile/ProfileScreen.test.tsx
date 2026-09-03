import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ClientResponseError } from "pocketbase";
import { MemoryRouter } from "react-router";
import { ProfileScreen } from "@/screens/profile/ProfileScreen";
import { consumeSessionMessage, STALE_SESSION_MESSAGE } from "@/data/staleSession";

/**
 * New gap-fill feature: Self-Service Profile Screen (business owner
 * request, post-Phase-5). Follows this project's own screen-test
 * conventions (`RentalNewScreen.test.tsx`/`LoginScreen.test.tsx`): mock
 * every `*.repo.ts` function this screen calls, mock `pocketbaseClient`'s
 * `pb.authStore.clear()` the same way every other stale-session-aware
 * screen test does, and mock `sonner` to assert exact success toasts
 * without a real (visually-timed) Sonner render.
 */

const currentAuthUser = vi.fn();
const ownAvatarUrl = vi.fn();
const updateOwnProfile = vi.fn();
const changeOwnPassword = vi.fn();

vi.mock("@/data/auth.repo", () => ({
  currentAuthUser: (...args: unknown[]) => currentAuthUser(...args),
  ownAvatarUrl: (...args: unknown[]) => ownAvatarUrl(...args),
  updateOwnProfile: (...args: unknown[]) => updateOwnProfile(...args),
  changeOwnPassword: (...args: unknown[]) => changeOwnPassword(...args),
}));

const clear = vi.fn();

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: (...args: unknown[]) => clear(...args) } },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const currentUser = {
  id: "u1",
  name: "Juan Pérez",
  phone: "5512345678",
  avatar: "",
  collectionId: "_pb_users_auth_",
  collectionName: "users",
};

function renderScreen() {
  return render(
    <MemoryRouter>
      <ProfileScreen />
    </MemoryRouter>,
  );
}

function makeClientResponseError(
  status: number,
  data?: Record<string, unknown>,
) {
  return new ClientResponseError({
    status,
    response: { message: "Failed to update record.", data: data ?? {} },
  });
}

describe("ProfileScreen (New gap-fill feature: Self-Service Profile Screen)", () => {
  beforeEach(() => {
    currentAuthUser.mockReset().mockReturnValue(currentUser);
    ownAvatarUrl.mockReset().mockReturnValue(null);
    updateOwnProfile.mockReset();
    changeOwnPassword.mockReset();
    clear.mockReset();
    vi.mocked(toast.success).mockReset();
    consumeSessionMessage();
  });

  it("prefills the name/phone form with the signed-in user's current values", () => {
    renderScreen();

    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan Pérez");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("5512345678");
  });

  describe("Datos personales", () => {
    it("shows validation errors and never calls updateOwnProfile with an empty name", async () => {
      const user = userEvent.setup();
      renderScreen();

      await user.clear(screen.getByLabelText("Nombre"));
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);

      expect(
        await screen.findByText("El nombre debe tener al menos 2 caracteres."),
      ).toBeInTheDocument();
      expect(updateOwnProfile).not.toHaveBeenCalled();
    });

    it("saves the new name/phone and shows a success toast", async () => {
      updateOwnProfile.mockResolvedValue({ ...currentUser, name: "Nuevo Nombre" });
      const user = userEvent.setup();
      renderScreen();

      await user.clear(screen.getByLabelText("Nombre"));
      await user.type(screen.getByLabelText("Nombre"), "Nuevo Nombre");
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);

      await waitFor(() => {
        expect(updateOwnProfile).toHaveBeenCalledWith({
          name: "Nuevo Nombre",
          phone: "5512345678",
        });
      });
      expect(toast.success).toHaveBeenCalledWith("Perfil actualizado.");
    });

    it("shows a friendly message on a duplicate-phone error (validation_not_unique)", async () => {
      updateOwnProfile.mockRejectedValue(
        makeClientResponseError(400, { phone: { code: "validation_not_unique" } }),
      );
      const user = userEvent.setup();
      renderScreen();

      await user.clear(screen.getByLabelText("Teléfono"));
      await user.type(screen.getByLabelText("Teléfono"), "5599999999");
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);

      expect(
        await screen.findByText("Ese teléfono ya está en uso por otra cuenta."),
      ).toBeInTheDocument();
    });

    it("shows a generic error on a non-stale, non-duplicate failure", async () => {
      updateOwnProfile.mockRejectedValue(new Error("network down"));
      const user = userEvent.setup();
      renderScreen();

      await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);

      expect(
        await screen.findByText(
          "No se pudo guardar el cambio. Verifica tu conexión e intenta de nuevo.",
        ),
      ).toBeInTheDocument();
    });

    it("clears the session (stale-session handling) instead of showing a generic error on a stale-session-shaped failure", async () => {
      updateOwnProfile.mockRejectedValue(
        makeClientResponseError(400, {}),
      );
      const user = userEvent.setup();
      renderScreen();

      await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);

      await waitFor(() => expect(clear).toHaveBeenCalled());
      expect(
        screen.queryByText(
          "No se pudo guardar el cambio. Verifica tu conexión e intenta de nuevo.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe("Cambiar contraseña", () => {
    it("shows a validation error and never calls changeOwnPassword when the confirmation doesn't match", async () => {
      const user = userEvent.setup();
      renderScreen();

      await user.type(screen.getByLabelText("Contraseña actual"), "old-pass");
      await user.type(screen.getByLabelText("Nueva contraseña"), "newpass123");
      await user.type(
        screen.getByLabelText("Confirmar nueva contraseña"),
        "different123",
      );
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[1]);

      expect(
        await screen.findByText("Las contraseñas no coinciden."),
      ).toBeInTheDocument();
      expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("shows a validation error when the new password is shorter than 8 characters", async () => {
      const user = userEvent.setup();
      renderScreen();

      await user.type(screen.getByLabelText("Contraseña actual"), "old-pass");
      await user.type(screen.getByLabelText("Nueva contraseña"), "short1");
      await user.type(
        screen.getByLabelText("Confirmar nueva contraseña"),
        "short1",
      );
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[1]);

      expect(
        await screen.findByText(
          "La nueva contraseña debe tener al menos 8 caracteres.",
        ),
      ).toBeInTheDocument();
      expect(changeOwnPassword).not.toHaveBeenCalled();
    });

    it("changes the password and shows a success toast on valid submission", async () => {
      changeOwnPassword.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderScreen();

      await user.type(screen.getByLabelText("Contraseña actual"), "old-pass");
      await user.type(screen.getByLabelText("Nueva contraseña"), "newpass123");
      await user.type(
        screen.getByLabelText("Confirmar nueva contraseña"),
        "newpass123",
      );
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[1]);

      await waitFor(() => {
        expect(changeOwnPassword).toHaveBeenCalledWith({
          oldPassword: "old-pass",
          password: "newpass123",
          passwordConfirm: "newpass123",
        });
      });
      expect(toast.success).toHaveBeenCalledWith("Contraseña actualizada.");
    });

    it("shows a generic error when the current password is wrong (never reveals which field failed)", async () => {
      changeOwnPassword.mockRejectedValue(new Error("bad old password"));
      const user = userEvent.setup();
      renderScreen();

      await user.type(screen.getByLabelText("Contraseña actual"), "wrong-pass");
      await user.type(screen.getByLabelText("Nueva contraseña"), "newpass123");
      await user.type(
        screen.getByLabelText("Confirmar nueva contraseña"),
        "newpass123",
      );
      await user.click(screen.getAllByRole("button", { name: "Guardar" })[1]);

      expect(
        await screen.findByText(
          "No se pudo cambiar la contraseña. Verifica tu contraseña actual e intenta de nuevo.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("redirects to a friendly stale-session message on /login after a stale-session error (regression sanity check via staleSession.ts constant)", () => {
    // Not exercised end-to-end here (that's App.test.tsx's job for the
    // route-level redirect) — this just proves the constant this screen
    // relies on for consistent stale-session microcopy hasn't drifted.
    expect(STALE_SESSION_MESSAGE).toBe("Tu sesión expiró. Vuelve a entrar.");
  });
});
