import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerForm } from "@/components/CustomerForm";

/**
 * Feature: Credential Photo Camera + Compression (Batch 3a) — `CustomerForm`
 * now wires the live-camera component (`CredentialCameraCapture`) instead of
 * a plain `<input type="file">`. That component already handles its own
 * capture/compress/type-validation (see `CredentialCameraCapture.test.tsx`),
 * so it's mocked here to a simple two-button stub — these tests only prove
 * `CustomerForm`'s own wiring (`onCapture`/`onCancel` handling), not the
 * camera/compression internals.
 */

vi.mock("@/components/CredentialCameraCapture", () => ({
  CredentialCameraCapture: ({
    onCapture,
    onCancel,
  }: {
    onCapture: (file: File) => void;
    onCancel?: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onCapture(
            new File(["x"], "credencial.jpg", { type: "image/jpeg" }),
          )
        }
      >
        Simular captura
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Simular cancelar
        </button>
      )}
    </div>
  ),
}));

describe("CustomerForm (§7.1, §20)", () => {
  it("rejects submit when name/phone are invalid and does not call onSubmit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre"), "J");
    await user.type(screen.getByLabelText("Teléfono"), "123");
    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    expect(
      await screen.findByText("El nombre debe tener al menos 2 caracteres."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the live camera capture and the 'credencial pendiente' hint when no photo has been selected yet", () => {
    render(<CustomerForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sin foto, el cliente se guardará con "credencial pendiente" y podrás agregarla después.',
      ),
    ).toBeInTheDocument();
  });

  it("submits with credentialPhoto: null when no credential photo was selected (§21/Anexo A.5 — 'credencial pendiente', not blocked)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Juan Pérez",
      phone: "5512345678",
      credentialPhoto: null,
    });
  });

  it("submits name, phone and the captured credential photo when everything is valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    await user.click(screen.getByRole("button", { name: "Simular captura" }));

    expect(
      await screen.findByText("Foto seleccionada: credencial.jpg"),
    ).toBeInTheDocument();
    // Camera UI is replaced by the preview once a photo is captured.
    expect(
      screen.queryByRole("button", { name: "Simular captura" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [submittedValues] = onSubmit.mock.calls[0] as [
      { name: string; phone: string; credentialPhoto: File },
    ];
    expect(submittedValues.name).toBe("Juan Pérez");
    expect(submittedValues.phone).toBe("5512345678");
    expect(submittedValues.credentialPhoto).toBeInstanceOf(File);
    expect(submittedValues.credentialPhoto.name).toBe("credencial.jpg");
  });

  it("shows a 'Guardando…' label on the submit button while isSubmitting is true (§16.13)", () => {
    render(<CustomerForm onSubmit={vi.fn()} isSubmitting />);

    expect(
      screen.getByRole("button", { name: "Guardando…" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Guardar cliente" }),
    ).not.toBeInTheDocument();
  });

  it("cancelling the camera leaves credentialPhoto unset and still lets the form submit successfully (Anexo A.5 — onCancel is not a hard error)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Simular cancelar" }));

    // No error shown, no camera UI left blocking the form — just the
    // pending hint and a way to try again later.
    expect(
      screen.getByText(
        'Sin foto, el cliente se guardará con "credencial pendiente" y podrás agregarla después.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Juan Pérez",
      phone: "5512345678",
      credentialPhoto: null,
    });
  });

  it("lets staff retake the photo after a capture via 'Cambiar foto', clearing the previous selection", async () => {
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Simular captura" }));
    expect(
      await screen.findByText("Foto seleccionada: credencial.jpg"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cambiar foto" }));

    expect(
      screen.queryByText("Foto seleccionada: credencial.jpg"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
  });
});
