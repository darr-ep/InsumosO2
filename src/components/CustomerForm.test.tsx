import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerForm } from "@/components/CustomerForm";

/**
 * Feature: Credential Photo Camera + Compression (Batch 3a) — `CustomerForm`
 * now wires the live-camera component (`CredentialCameraCapture`) instead of
 * a plain `<input type="file">`. That component already handles its own
 * capture/compress/type-validation (see `CredentialCameraCapture.test.tsx`),
 * so it's mocked here to a simple stub — these tests only prove
 * `CustomerForm`'s own wiring (`onCapture` handling), not the camera/
 * compression internals. `CustomerForm` no longer passes `onCancel` (the
 * business owner asked for the "cancel camera" affordance to be dropped
 * from this flow entirely), so the mock doesn't offer one either.
 *
 * jsdom does not implement `URL.createObjectURL`/`revokeObjectURL` (used by
 * `CustomerForm` to build the captured-photo thumbnail), so both are stubbed
 * below — `createObjectURL` returns a deterministic `blob:` URL per call so
 * tests can assert the rendered `<img>`'s `src`.
 *
 * Business owner's fourth follow-up: `CustomerForm` now passes `autoStart`
 * and `onCancel` again — the mock below renders both as simple, inert markers
 * ("Auto-inició la cámara" text when `autoStart` is true; a "Cancelar" button
 * when `onCancel` is provided) so these tests can prove CustomerForm's own
 * WIRING (does it pass the right prop values at the right time?) without
 * re-testing `CredentialCameraCapture`'s internal mode-gating logic — that's
 * already covered in `CredentialCameraCapture.test.tsx`.
 */

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createObjectURL = vi.fn(() => "blob:mock-credencial-preview");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("@/components/CredentialCameraCapture", () => ({
  CredentialCameraCapture: ({
    onCapture,
    onCancel,
    autoStart,
  }: {
    onCapture: (file: File) => void;
    onCancel?: () => void;
    autoStart?: boolean;
  }) => (
    <div>
      {autoStart && <p>Auto-inició la cámara</p>}
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
          Cancelar
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

    // Camera UI is replaced by an actual thumbnail preview once a photo is
    // captured — not just its filename.
    const preview = await screen.findByAltText("Foto de credencial");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", "blob:mock-credencial-preview");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
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

  it("lets staff retake the photo directly via 'Cambiar foto', clearing the previous selection with no confirmation step", async () => {
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Simular captura" }));
    expect(
      await screen.findByAltText("Foto de credencial"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cambiar foto" }));

    // design-fidelity: retake is immediate, no confirmation dialog involved.
    expect(
      screen.queryByRole("heading", { name: "¿Tomar otra foto?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByAltText("Foto de credencial"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
    // The previous preview's object URL must be released, not leaked.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-credencial-preview");
  });

  it("does not auto-start the camera on first entry (before any photo has ever been captured)", () => {
    render(<CustomerForm onSubmit={vi.fn()} />);

    expect(screen.queryByText("Auto-inició la cámara")).not.toBeInTheDocument();
  });

  it("passes onCancel through so 'Cancelar' can render (CredentialCameraCapture gates it to live mode itself)", () => {
    render(<CustomerForm onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("pre-fills 'Nombre' from initialValues (CustomerPicker carries over the search query)", () => {
    render(<CustomerForm onSubmit={vi.fn()} initialValues={{ name: "Juan" }} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Juan");
  });

  it("auto-starts the camera on a retake ('Cambiar foto'), but not on the very first entry", async () => {
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={vi.fn()} />);

    // First entry: no auto-start.
    expect(screen.queryByText("Auto-inició la cámara")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simular captura" }));
    await screen.findByAltText("Foto de credencial");

    await user.click(screen.getByRole("button", { name: "Cambiar foto" }));

    // Retake: jumps straight into the live camera, no confirmation step.
    expect(await screen.findByText("Auto-inició la cámara")).toBeInTheDocument();
  });

  it("clears the captured photo and returns directly to the camera on 'Cambiar foto', with no confirmation dialog (owner reversal of design-fidelity #5)", async () => {
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Simular captura" }));
    await screen.findByAltText("Foto de credencial");

    await user.click(screen.getByRole("button", { name: "Cambiar foto" }));

    expect(
      screen.queryByRole("heading", { name: "¿Tomar otra foto?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByAltText("Foto de credencial"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Simular captura" }),
    ).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-credencial-preview");
  });
});

describe("CustomerForm — liveReport mode (no submit button, continuous reporting)", () => {
  it("renders no submit button in liveReport mode", () => {
    render(<CustomerForm onSubmit={vi.fn()} liveReport />);

    expect(
      screen.queryByRole("button", { name: "Guardar cliente" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });

  it("calls onSubmit immediately on mount with the initial (empty) values", async () => {
    const onSubmit = vi.fn();
    render(<CustomerForm onSubmit={onSubmit} liveReport />);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      name: "",
      phone: "",
      credentialPhoto: null,
    });
  });

  it("reports updated values as the user types, and shows an inline error as soon as an invalid field is blurred", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} liveReport />);

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "12");
    // Blur the invalid phone field — mode: "onBlur" should surface the error
    // right away, without any submit button to trigger it.
    await user.tab();

    expect(
      await screen.findByText("El teléfono debe tener 10 dígitos."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        name: "Juan Pérez",
        phone: "12",
        credentialPhoto: null,
      }),
    );
  });

  it("reports the captured photo immediately, with no separate submit step", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} liveReport />);

    await user.click(screen.getByRole("button", { name: "Simular captura" }));

    await waitFor(() => {
      const lastCall = onSubmit.mock.calls.at(-1)?.[0] as
        | { credentialPhoto: File | null }
        | undefined;
      expect(lastCall?.credentialPhoto).toBeInstanceOf(File);
    });
  });
});
