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
 * The camera does NOT auto-start on mount by default (business owner's
 * request) — every test that needs a live stream must first find and click
 * "Tomar foto", except the dedicated `autoStart` describe block at the
 * bottom, which proves the opt-in mount-time auto-start used by
 * `CustomerForm.tsx` for retakes.
 *
 * "Cancelar" is only ever shown once the camera is live (never during idle/
 * loading/fallback) — see the dedicated tests for that gating and for what
 * clicking it resets.
 *
 * The live preview crops purely via CSS (`aspect-ratio` + `object-cover` on
 * a fixed-ratio container) instead of a separate JS-computed guide overlay,
 * so there's nothing guide-related left to assert here beyond the video
 * element itself.
 *
 * `<canvas>`/`<video>` real pixel operations are NOT meaningfully testable
 * in jsdom — `canvas.getContext('2d')` returns `null` without the native
 * `canvas` npm package (confirmed not installed, out of scope), same
 * documented limitation as `imageEscpos.test.ts`'s `loadAndDither` and
 * `imageCompression.test.ts`'s `compressImage`. `HTMLCanvasElement.prototype.getContext`
 * / `.toBlob` are stubbed directly below to prove the control flow (capture
 * button → canvas draw call happened → onCapture received its result), not
 * real pixel data. `compressImage` itself is mocked so this file only proves
 * CredentialCameraCapture's own wiring, consistent with `imageCompression.ts`'s
 * own doc comment pointing here for that coverage.
 */

// Only `compressImage` is mocked (still used by the fallback file-input
// path) — `computeCompressedDimensions`/`DEFAULT_MAX_WIDTH_PX`/
// `DEFAULT_JPEG_QUALITY` are real, since `captureAndCompressFrame` (the
// live-capture path) now imports and uses them directly.
vi.mock("@/lib/imageCompression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageCompression")>();
  return { ...actual, compressImage: vi.fn() };
});

const mockedCompressImage = vi.mocked(compressImage);

function stubCanvas() {
  const drawImage = vi.fn();
  // Single-pass crop+resize+compress happens in one canvas draw
  // (`captureAndCompressFrame`), so there's only one blob for the live
  // capture path — no separate "raw" vs "compressed" step to distinguish.
  const capturedBlob = new Blob(["captured-frame"], { type: "image/jpeg" });
  const toBlob = vi.fn((callback: BlobCallback) => {
    callback(capturedBlob);
  });
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  // @ts-expect-error -- intentionally narrow stub, only drawImage is used
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage }));
  HTMLCanvasElement.prototype.toBlob = toBlob as typeof HTMLCanvasElement.prototype.toBlob;

  return {
    drawImage,
    toBlob,
    capturedBlob,
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

// The camera never auto-starts — every live-mode test goes through this
// button first, proving the deferral itself stays intact everywhere else.
async function startCameraViaButton() {
  const user = userEvent.setup();
  const startButton = await screen.findByRole("button", { name: "Tomar foto" });
  await user.click(startButton);
  return user;
}

describe("CredentialCameraCapture — camera does not auto-start (business owner request)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders an 'Tomar foto' button and does NOT call getUserMedia until it's clicked", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "Tomar foto" }),
    ).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByTestId("credential-camera-video")).not.toBeInTheDocument();
  });

  it("does not show 'Cancelar' before the camera is started (idle mode), even when onCancel is provided", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const onCancel = vi.fn();

    render(<CredentialCameraCapture onCapture={vi.fn()} onCancel={onCancel} />);

    await screen.findByRole("button", { name: "Tomar foto" });
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

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

  it("requests getUserMedia with facingMode environment and renders the live video once 'Tomar foto' is tapped", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);
    await startCameraViaButton();

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

  it("wires the live stream to the video element's srcObject (regression: the element didn't exist yet when this was set, so the preview rendered black)", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);
    await startCameraViaButton();

    const video = await screen.findByTestId("credential-camera-video");

    await waitFor(() =>
      expect((video as HTMLVideoElement).srcObject).toBe(stream),
    );
  });

  it("shows 'Cancelar' next to the capture button once live, when onCancel is provided", async () => {
    const stream = makeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    render(<CredentialCameraCapture onCapture={vi.fn()} onCancel={vi.fn()} />);
    await startCameraViaButton();

    await screen.findByTestId("credential-camera-video");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("captures a frame (crop+resize+compress in one canvas pass) and calls onCapture with a File on 'Tomar foto'", async () => {
    const stream = makeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const onCapture = vi.fn();

    render(<CredentialCameraCapture onCapture={onCapture} />);
    const user = await startCameraViaButton();

    const captureButton = await screen.findByRole("button", { name: "Tomar foto" });
    await user.click(captureButton);

    await waitFor(() => expect(onCapture).toHaveBeenCalledTimes(1));

    // Canvas draw crops+scales in one native call — the 9-arg drawImage form.
    expect(canvasStub.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      0,
      0,
      expect.any(Number),
      expect.any(Number),
    );
    expect(canvasStub.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      expect.any(Number),
    );
    // Single-pass: compressImage is never called on the live-capture path —
    // captureAndCompressFrame's own canvas draw already produces the final,
    // already-compressed blob.
    expect(mockedCompressImage).not.toHaveBeenCalled();

    const receivedFile = onCapture.mock.calls[0][0] as File;
    expect(receivedFile).toBeInstanceOf(File);
    expect(receivedFile.name).toBe("credencial.jpg");
    expect(receivedFile.type).toBe("image/jpeg");
  });

  it("shows an error and does not call onCapture when the canvas can't produce a blob", async () => {
    const stream = makeStream();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    // Force captureAndCompressFrame's own failure path (no compressImage
    // involved in the live-capture path anymore).
    canvasStub.toBlob.mockImplementationOnce((callback: BlobCallback) => {
      callback(null);
    });
    const onCapture = vi.fn();

    render(<CredentialCameraCapture onCapture={onCapture} />);
    const user = await startCameraViaButton();

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

  it("falls back to a file input immediately (no 'Tomar foto' button) when navigator.mediaDevices.getUserMedia does not exist", async () => {
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
    await startCameraViaButton();

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
    await startCameraViaButton();
    await screen.findByTestId("credential-camera-video");

    unmount();

    expect(stopSpy).toHaveBeenCalledTimes(2); // 2 tracks from makeStream()
  });

  it("stops every MediaStreamTrack, calls onCancel, and returns to idle when 'Cancelar' is clicked", async () => {
    const stopSpy = vi.fn();
    const stream = makeStream(stopSpy);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const onCancel = vi.fn();

    render(<CredentialCameraCapture onCapture={vi.fn()} onCancel={onCancel} />);
    const user = await startCameraViaButton();
    await screen.findByTestId("credential-camera-video");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(stopSpy).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // Back to idle: the start button is available again (so the user can
    // retry), no leftover live UI, and "Cancelar" itself disappears with it
    // (only shown while live).
    expect(
      await screen.findByRole("button", { name: "Tomar foto" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("credential-camera-video")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
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

describe("CredentialCameraCapture — autoStart (used by CustomerForm.tsx for retakes)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("with autoStart, requests the camera automatically on mount — no button click needed", async () => {
    const stream = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} autoStart />);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: "environment" },
      }),
    );
    expect(
      await screen.findByTestId("credential-camera-video"),
    ).toBeInTheDocument();
    // Idle and live share the same "Tomar foto" label (by design — see file
    // doc comment), so the button being present here is the LIVE capture
    // button, not a leftover idle one; the video element above is what
    // actually proves autoStart skipped idle.
  });

  it("without autoStart (the default), still does not call getUserMedia on mount — the no-auto-start requirement still holds", async () => {
    const getUserMedia = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    render(<CredentialCameraCapture onCapture={vi.fn()} />);

    await screen.findByRole("button", { name: "Tomar foto" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
