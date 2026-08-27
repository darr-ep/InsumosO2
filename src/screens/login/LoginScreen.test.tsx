import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ClientResponseError } from "pocketbase";
import { LoginScreen } from "@/screens/login/LoginScreen";
import {
  consumeSessionMessage,
  handleIfStaleSession,
  STALE_SESSION_MESSAGE,
} from "@/data/staleSession";

const getLoginDirectory = vi.fn();
const loginWithPassword = vi.fn();
const navigate = vi.fn();

vi.mock("@/data/auth.repo", () => ({
  getLoginDirectory: (...args: unknown[]) => getLoginDirectory(...args),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
}));

// §14 gap-fill: `handleIfStaleSession` calls `pb.authStore.clear()` —
// mocked the same way App.test.tsx already mocks `pb`, so this file can
// legitimately queue a pending session message via the real
// `staleSession.ts` module without touching a real PocketBase client.
vi.mock("@/data/pocketbaseClient", () => ({
  pb: { authStore: { clear: vi.fn() } },
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
    // Drain any pending message left over by a prior test in this file.
    consumeSessionMessage();
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

  it("shows an error instead of crashing when the directory resolves with a non-array value (real bug: browser-cache/StrictMode race)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reproducing the actual malformed shape found live
    getLoginDirectory.mockResolvedValue({} as any);

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

  it("shows 'Tu sesión expiró. Vuelve a entrar.' when a stale-session redirect queued that message (§14 gap-fill)", async () => {
    getLoginDirectory.mockResolvedValue([juan]);
    handleIfStaleSession(new ClientResponseError({ status: 401, response: {} }));

    renderScreen();

    expect(await screen.findByText(STALE_SESSION_MESSAGE)).toBeInTheDocument();
  });

  it("does NOT show a session-expired message on a normal fresh visit to /login (regression)", async () => {
    getLoginDirectory.mockResolvedValue([juan]);

    renderScreen();

    await screen.findByRole("button", { name: "Juan Pérez" });
    expect(screen.queryByText(STALE_SESSION_MESSAGE)).not.toBeInTheDocument();
  });
});
