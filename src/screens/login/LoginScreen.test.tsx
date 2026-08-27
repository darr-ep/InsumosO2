import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientResponseError } from "pocketbase";
import { LoginScreen } from "@/screens/login/LoginScreen";

const getLoginDirectory = vi.fn();
const loginWithPassword = vi.fn();
const navigate = vi.fn();

vi.mock("@/data/auth.repo", () => ({
  getLoginDirectory: (...args: unknown[]) => getLoginDirectory(...args),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

const juan = { id: "u1", name: "Juan Pérez", phone: "5512345678" };
const maria = { id: "u2", name: "María López", phone: "5598765432" };

function renderScreen() {
  return render(
    <MemoryRouter>
      <LoginScreen />
    </MemoryRouter>,
  );
}

function makeClientResponseError(status: number) {
  return new ClientResponseError({ status, response: {} });
}

describe("LoginScreen — real login (§14, §16.6, CU1, gap-fill)", () => {
  beforeEach(() => {
    getLoginDirectory.mockReset();
    loginWithPassword.mockReset();
    navigate.mockReset();
  });

  it("shows a picker with every business user's name after loading the directory", async () => {
    getLoginDirectory.mockResolvedValue([juan, maria]);

    renderScreen();

    expect(
      await screen.findByRole("button", { name: "Juan Pérez" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "María López" }),
    ).toBeInTheDocument();
  });

  it("shows an error when the directory fails to load", async () => {
    getLoginDirectory.mockRejectedValue(new Error("network down"));

    renderScreen();

    expect(
      await screen.findByText(
        "No se pudo cargar la lista de usuarios. Intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });

  it("reveals a password field after tapping a user, and submits phone+password on confirm", async () => {
    getLoginDirectory.mockResolvedValue([juan]);
    loginWithPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Juan Pérez" }));

    const passwordInput = await screen.findByLabelText("Contraseña");
    await user.type(passwordInput, "s3cret");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(loginWithPassword).toHaveBeenCalledWith("5512345678", "s3cret");
    });
  });

  it("navigates to /dashboard after a successful login", async () => {
    getLoginDirectory.mockResolvedValue([juan]);
    loginWithPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Juan Pérez" }));
    await user.type(await screen.findByLabelText("Contraseña"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows a generic 'credenciales incorrectas' message on a failed login, without leaking whether the user or password was wrong", async () => {
    getLoginDirectory.mockResolvedValue([juan]);
    loginWithPassword.mockRejectedValue(makeClientResponseError(400));
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Juan Pérez" }));
    await user.type(await screen.findByLabelText("Contraseña"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText("Credenciales incorrectas."),
    ).toBeInTheDocument();
  });

  it("shows a clear rate-limit message on a 429 instead of a raw error", async () => {
    getLoginDirectory.mockResolvedValue([juan]);
    loginWithPassword.mockRejectedValue(makeClientResponseError(429));
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Juan Pérez" }));
    await user.type(await screen.findByLabelText("Contraseña"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText(
        "Demasiados intentos. Espera un momento e intenta de nuevo.",
      ),
    ).toBeInTheDocument();
  });

  it("lets the visitor go back to the picker from the password step", async () => {
    getLoginDirectory.mockResolvedValue([juan, maria]);
    const user = userEvent.setup();

    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Juan Pérez" }));
    await screen.findByLabelText("Contraseña");

    await user.click(screen.getByRole("button", { name: "Elegir otro usuario" }));

    expect(
      await screen.findByRole("button", { name: "María López" }),
    ).toBeInTheDocument();
  });
});
