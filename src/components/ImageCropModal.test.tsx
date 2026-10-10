import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageCropModal } from "@/components/ImageCropModal";

describe("ImageCropModal", () => {
  const mockFile = new File(["fake-image"], "test-id.jpg", { type: "image/jpeg" });

  it("renders when open with dialog title and controls", () => {
    render(
      <ImageCropModal
        open={true}
        file={mockFile}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Recortar credencial")).toBeInTheDocument();
    expect(screen.getByText("Credencial")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar foto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("calls onCancel when Cancelar button is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageCropModal
        open={true}
        file={mockFile}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });



  it("calls onConfirm with a file when Usar foto is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageCropModal
        open={true}
        file={mockFile}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Usar foto" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
