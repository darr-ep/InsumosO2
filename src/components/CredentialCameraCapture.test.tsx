import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialCameraCapture } from "@/components/CredentialCameraCapture";
import { compressImage } from "@/lib/imageCompression";

/**
 * Feature: Credential Photo Camera + Compression (Batch 2). Mocks
 * `navigator.mediaDevices.getUserMedia` following this project's own
 * established precedent for mocking a browser hardware API —
 * `WebBluetoothPrinter.test.ts`'s `navigator.bluetooth` mocking via
 * `vi.stubGlobal` + real behavioral assertions, not just "was called".
 *
 * `<canvas>`/`<video>` real pixel operations are NOT meaningfully testable
 * in jsdom — `canvas.getContext('2d')` returns `null` without the native
 * `canvas` npm package (confirmed not installed, out of scope), same
 * documented limitation as `imageEscpos.test.ts`'s `loadAndDither` and
 * `imageCompression.test.ts`'s `compressImage`. `HTMLCanvasElement.prototype.getContext`
 * / `.toBlob` are stubbed directly below to prove the control flow (capture
 * button → canvas draw call happened → compressImage was called → onCapture
 * received its result), not real pixel data. `compressImage` itself is
 * mocked so this file only proves CredentialCameraCapture's own wiring,
 * consistent with `imageCompression.ts`'s own doc comment pointing here for
 * that coverage.
 */

vi.mock("@/lib/imageCompression", () => ({
  compressImage: vi.fn(),
}));

const mockedCompressImage = vi.mocked(compressImage);

function stubCanvas() {
  const drawImage = vi.fn();
  const compressedBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });
  const rawBlob = new Blob(["raw-frame"], { type: "image/jpeg" });
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(rawBlob);
  });
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  // @ts-expect-error -- intentionally narrow stub, only drawImage is used
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage }));
  HTMLCanvasElement.prototype.toBlob = toBlob as typeof HTMLCanvasElement.prototype.toBlob;

  return {
    drawImage,
    toBlob,
    rawBlob,
    compressedBlob,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    },
  };
}

function makeStream(stopSpy = vi.fn()) {
  return {
    getTracks: () => [{ stop: stopSpy }, { stop: stopSpy }],
  } as unknown as MediaStream;
}

describe("CredentialCameraCapture — live camera happy path", () => {
  let canvasStub: ReturnType<typeof stubCanvas>;

  beforeEach(() => {
    canvasStub = stubCanvas();
  });

  afterEach(() => {
    canvasStub.restore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("requests getUserMedia with facingMode environment and renders the live video + guide overlay", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId("credential-camera-video")).toBeInTheDocument(),
    );
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: "environment" },
    });
    expect(
      screen.getByRole("button", { name: "Tomar foto" }),
    ).toBeInTheDocument();
    // Fallback input must NOT be present once live mode is active.
    expect(screen.queryByLabelText("Foto de credencial")).not.toBeInTheDocument();
  });

  it("captures a frame, crops it, compresses it and calls onCapture with a File on 'Tomar foto'", async () => {
    const stream = makeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    mockedCompressImage.mockResolvedValue(canvasStub.compressedBlob);
    const onCapture = vi.fn();
    const user = userEvent.setup();

    render(<CredentialCameraCapture onCapture={onCapture} />);

    const captureButton = await screen.findByRole("button", { name: "Tomar foto" });
    await user.click(captureButton);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));

    // Canvas draw actually happened (control-flow proof, not real pixels).
    expect(canvasStub.drawImage).toHaveBeenCalled();
    expect(canvasStub.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      expect.any(Number),
    );
    // The raw cropped frame is what gets sent into compressImage.
    expect(mockedCompressImage).toHaveBeenCalledWith(canvasStub.rawBlob);

    const receivedFile = onCapture.mock.calls[0][0] as File;
    expect(receivedFile).toBeInstanceOf(File);
    expect(receivedFile.name).toBe("credencial.jpg");
    expect(receivedFile.type).toBe("image/jpeg");
  });

  it("shows an error and does not call onCapture when capture fails", async () => {
    const stream = makeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    mockedCompressImage.mockRejectedValue(new Error("boom"));
    const onCapture = vi.fn();
    const user = userEvent.setup();

    render(<CredentialCameraCapture onCapture={onCapture} />);

    const captureButton = await screen.findByRole("button", { name: "Tomar foto" });
    await user.click(captureButton);

    expect(
      await screen.findByText("No se pudo capturar la foto. Intenta de nuevo."),
    ).toBeInTheDocument();
    expect(onCapture).not.toHaveBeenCalled();
  });
});

describe("CredentialCameraCapture — getUserMedia fallback (never dead-ends the user)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("falls back to a file input when navigator.mediaDevices.getUserMedia does not exist", async () => {
    vi.stubGlobal("navigator", {});

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    expect(
      await screen.findByLabelText("Foto de credencial"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tomar foto" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to a file input when getUserMedia rejects (permission denied)", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    expect(
      await screen.findByLabelText("Foto de credencial"),
    ).toBeInTheDocument();
  });

  it("the fallback input has accept=image/* and capture=environment (opens native camera app on mobile)", async () => {
    vi.stubGlobal("navigator", {});

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    const input = await screen.findByLabelText("Foto de credencial");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("capture", "environment");
  });

  it("still runs the selected file through compressImage and calls onCapture in fallback mode", async () => {
    vi.stubGlobal("navigator", {});
    mockedCompressImage.mockResolvedValue(
      new Blob(["compressed"], { type: "image/jpeg" }),
    );
    const onCapture = vi.fn();
    const user = userEvent.setup();

    render(<CredentialCameraCapture onCapture={onCapture} />);

    const input = await screen.findByLabelText("Foto de credencial");
    const file = new File(["x"], "credencial.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));
    expect(mockedCompressImage).toHaveBeenCalledWith(file);

    const receivedFile = onCapture.mock.calls[0][0] as File;
    expect(receivedFile.name).toBe("credencial.jpg");
    expect(receivedFile.type).toBe("image/jpeg");
  });
});

describe("CredentialCameraCapture — media stream cleanup (avoids leaving the camera 'on')", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stops every MediaStreamTrack on unmount", async () => {
    const stopSpy = vi.fn();
    const stream = makeStream(stopSpy);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { unmount } = render(<CredentialCameraCapture onCapture={vi.fn()} />);
    await screen.findByTestId("credential-camera-video");

    unmount();

    expect(stopSpy).toHaveBeenCalledTimes(2); // 2 tracks from makeStream()
  });

  it("stops every MediaStreamTrack and calls onCancel when 'Cancelar' is clicked", async () => {
    const stopSpy = vi.fn();
    const stream = makeStream(stopSpy);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<CredentialCameraCapture onCapture={vi.fn()} onCancel={onCancel} />);
    await screen.findByTestId("credential-camera-video");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(stopSpy).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render a 'Cancelar' button when onCancel is not provided (triangulation)", async () => {
    vi.stubGlobal("navigator", {});

    render(<CredentialCameraCapture onCapture={vi.fn()} />);
    await screen.findByLabelText("Foto de credencial");

    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });
});
