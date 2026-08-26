import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerForm } from "@/components/CustomerForm";

function makePhoto(name = "credencial.png", type = "image/png", size = 1024) {
  const file = new File(["x".repeat(size)], name, { type });
  return file;
}

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

  it("blocks submit when no credential photo was selected, even with valid name/phone", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    expect(
      await screen.findByText("Selecciona una foto de credencial."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits name, phone and the selected credential photo when everything is valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CustomerForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");

    const photo = makePhoto();
    await user.upload(screen.getByLabelText("Foto de credencial"), photo);

    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Juan Pérez",
      phone: "5512345678",
      credentialPhoto: photo,
    });
  });

  it("rejects a credential photo with an unsupported mime type (§20)", async () => {
    // The input has accept="image/*" (native picker hint) — bypass
    // user-event's accept-based filtering so this test can exercise our
    // own JS validation (isAcceptedCredentialPhotoType), which is the real
    // source of truth since `accept` is only a UX hint, not enforcement.
    const user = userEvent.setup({ applyAccept: false });
    render(<CustomerForm onSubmit={vi.fn()} />);

    const badFile = new File(["x"], "credencial.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Foto de credencial"), badFile);

    expect(
      await screen.findByText(
        "Formato de imagen no válido. Usa JPG, PNG o WEBP.",
      ),
    ).toBeInTheDocument();
  });
});
