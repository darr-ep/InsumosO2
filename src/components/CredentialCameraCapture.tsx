import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_WIDTH_PX,
  compressImage,
  computeCompressedDimensions,
} from "@/lib/imageCompression";
import {
  ID_CARD_ASPECT_RATIO,
  computeCenterCropRect,
  toJpegFilename,
} from "@/lib/credentialCameraCrop";

/**
 * Feature: Credential Photo Camera + Compression (Batch 2) — live camera
 * capture UI, consuming Batch 1's `compressImage` (`src/lib/imageCompression.ts`,
 * commit `5cc8cd0`). Business owner's explicit tradeoff: prioritize a
 * simple one-step "look and shoot" flow for an elderly, non-technical end
 * user over camera-preview elegance — but the feature must never dead-end
 * a user whose device/browser can't do live camera access, hence the real
 * (not just documented) `<input type="file" capture="environment">`
 * fallback below.
 *
 * The camera does NOT auto-start on mount by default — permission is only
 * requested once the user taps "Tomar foto" (business owner's request:
 * opening "Cliente nuevo" shouldn't immediately trigger the OS
 * camera-permission prompt; the idle-state button shares the same
 * "Tomar foto" label as the later live-mode capture button — never shown
 * simultaneously since idle/live are mutually exclusive modes, so there's no
 * ambiguity for the user, just one consistent label for "get me a photo"
 * regardless of step). The optional `autoStart` prop opts back into
 * requesting the camera immediately on mount — used by `CustomerForm.tsx`
 * only when the user is RETAKING a photo (tapping "Cambiar foto"), so that
 * specific action jumps straight into the live preview instead of back to
 * the idle button; first-time entry still never passes it, preserving the
 * no-auto-start requirement. The preview itself is cropped purely via CSS
 * (`aspectRatio` + `object-cover`), so only the area that actually gets
 * saved is ever visible — no separate JS-computed guide overlay needed.
 *
 * "Cancelar" (`onCancel`) is only ever shown once the camera is actually
 * live (streaming), next to the capture "Tomar foto" button — never during
 * idle/loading/fallback, since there's nothing meaningful to cancel before
 * a stream exists. Clicking it stops the stream, resets back to idle (so
 * "Tomar foto" can be tapped again), and notifies the caller via `onCancel`.
 *
 * Drop-in replacement shape for `CustomerForm.tsx`/`CustomerDetailSheet.tsx`'s
 * current `File | null` photo state — produces the same `File` via
 * `onCapture`.
 *
 * Crop math (`computeCenterCropRect`/`toJpegFilename`/`ID_CARD_ASPECT_RATIO`)
 * lives in `src/lib/credentialCameraCrop.ts` — kept out of this file so it
 * stays component-only-exports (react-refresh) and is unit-testable without
 * React/canvas/video machinery, same separation as `imageCompression.ts`.
 */

export interface CredentialCameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
  // Requests the camera immediately on mount instead of waiting for the
  // idle "Tomar foto" tap — see file doc comment (used only for retakes).
  autoStart?: boolean;
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], toJpegFilename(filename), {
    type: blob.type || "image/jpeg",
  });
}

/**
 * Draws the current video frame onto an offscreen canvas, center-cropped to
 * `targetAspectRatio` AND resized to the same target size `compressImage`
 * would produce — in a single canvas draw + single JPEG encode, instead of
 * cropping at full native camera resolution (phone cameras are commonly
 * 3000-4000px+ wide) and then re-encoding a second time through
 * `compressImage`. The 9-argument `drawImage` form crops and scales in one
 * native, GPU-accelerated call, so the output of this function is already
 * the final compressed `Blob` — no second pass needed, which is what keeps
 * "Tomar foto" → "Guardar cliente" fast on a phone.
 *
 * NOT unit-tested via real pixel data — same documented limitation as
 * `imageCompression.ts`'s `compressImage` and `imageEscpos.ts`'s
 * `loadAndDither`: jsdom's `canvas.getContext('2d')` returns `null` without
 * the native `canvas` npm package (confirmed not installed, out of scope).
 * `CredentialCameraCapture.test.tsx` proves the control flow (capture →
 * canvas draw → onCapture) by stubbing `HTMLCanvasElement.prototype.getContext`/
 * `toBlob` directly; `computeCenterCropRect`/`computeCompressedDimensions` —
 * the actual crop/resize math this function depends on — are pure functions
 * of plain numbers and are fully covered in their own test files.
 */
async function captureAndCompressFrame(
  video: HTMLVideoElement,
  targetAspectRatio: number = ID_CARD_ASPECT_RATIO,
): Promise<Blob> {
  const crop = computeCenterCropRect(
    video.videoWidth,
    video.videoHeight,
    targetAspectRatio,
  );
  const { width, height } = computeCompressedDimensions(
    { width: crop.sWidth, height: crop.sHeight },
    { maxWidthPx: DEFAULT_MAX_WIDTH_PX },
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear el canvas 2D para capturar la foto.");
  }

  ctx.drawImage(
    video,
    crop.sx,
    crop.sy,
    crop.sWidth,
    crop.sHeight,
    0,
    0,
    width,
    height,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", DEFAULT_JPEG_QUALITY);
  });

  if (!blob) {
    throw new Error("No se pudo capturar la foto.");
  }

  return blob;
}

type Mode = "idle" | "loading" | "live" | "fallback";

function supportsGetUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function CredentialCameraCapture({
  onCapture,
  onCancel,
  autoStart = false,
}: CredentialCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);
  // Devices without getUserMedia at all skip straight to the fallback file
  // input — showing an "Iniciar cámara" button that's guaranteed to fail
  // would just be a dead end. Everything else starts idle: no permission
  // prompt, no stream, until the user explicitly taps the button.
  const [mode, setMode] = useState<Mode>(() =>
    supportsGetUserMedia() ? "idle" : "fallback",
  );
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Stops every track of the current stream — a real, easy-to-miss leak
  // otherwise: without this the browser/OS camera-in-use indicator stays
  // lit after the component is done with the camera. Safe no-op when no
  // stream was ever started (e.g. cancelling from "idle").
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      stopStream();
    };
  }, [stopStream]);

  // Invoked from the "Iniciar cámara" button — no longer runs automatically
  // on mount (business owner's request: opening the form shouldn't
  // immediately trigger the OS camera-permission prompt).
  const startCamera = useCallback(async () => {
    setMode("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      setMode("live");
    } catch {
      // Permission denied, no camera hardware, insecure context, etc.
      // Never dead-end the user — fall back to the native file picker.
      if (!unmountedRef.current) {
        setMode("fallback");
      }
    }
  }, []);

  // Opts back into requesting the camera immediately on mount — only when
  // the caller explicitly asks for it (retakes), never by default. Reuses
  // the same `startCamera` the idle button's `onClick` calls; skipped on a
  // device without `getUserMedia` at all (mode already lazy-initialized to
  // "fallback" above, nothing to auto-start there). `startCamera`'s first
  // statement is a synchronous `setMode` call, which `react-hooks/set-state-in-effect`
  // flags if invoked directly in an effect body (cascading-render risk) —
  // deferred a tick via `queueMicrotask` to sidestep that, which is
  // functionally invisible here (camera permission is inherently async).
  useEffect(() => {
    if (autoStart && supportsGetUserMedia()) {
      queueMicrotask(() => void startCamera());
    }
    // Mount-only: re-running this on every `autoStart`/`startCamera`
    // identity change would re-trigger a fresh camera request whenever this
    // component re-renders, not just once when it first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The <video> element only mounts once mode flips to "live" (see JSX
  // below), so assigning srcObject inside startCamera() above would hit a
  // still-null videoRef — the element doesn't exist yet at that point. This
  // effect runs after that render, once the element is guaranteed to exist,
  // and is what actually wires the stream to the video for playback.
  useEffect(() => {
    if (mode === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  async function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    setError(null);
    try {
      const compressed = await compressImage(file);
      onCapture(blobToFile(compressed, file.name));
    } catch {
      setError("No se pudo procesar la foto. Intenta de nuevo.");
    }
  }

  async function handleCapture() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setError(null);
    setIsCapturing(true);
    try {
      const blob = await captureAndCompressFrame(video);
      onCapture(blobToFile(blob, "credencial.jpg"));
    } catch {
      setError("No se pudo capturar la foto. Intenta de nuevo.");
    } finally {
      setIsCapturing(false);
    }
  }

  function handleCancel() {
    stopStream();
    // This component now stays mounted continuously (the caller no longer
    // unmounts/remounts it to "reset" on cancel) — reset back to idle
    // ourselves, or `mode` would stay stuck on "live" with a dead stream and
    // a frozen video element.
    setMode("idle");
    onCancel?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {(mode === "idle" || mode === "loading" || mode === "live") && (
        <div
          className="relative flex items-center justify-center overflow-hidden rounded-md bg-black"
          style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
        >
          {mode === "idle" && (
            <Button type="button" onClick={() => void startCamera()}>
              <Camera aria-hidden="true" />
              Tomar foto
            </Button>
          )}
          {mode === "loading" && (
            <p className="text-sm text-white/80">Iniciando cámara…</p>
          )}
          {mode === "live" && (
            // object-cover on this fixed-aspect-ratio box crops the video
            // exactly the way computeCenterCropRect crops the saved photo
            // (both center-crop to the same target aspect ratio) — so the
            // preview only ever shows what actually gets saved, with no
            // separate guide overlay/mask needed.
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              data-testid="credential-camera-video"
            />
          )}
        </div>
      )}

      {mode === "fallback" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="credential-camera-fallback-input">
            Foto de credencial
          </Label>
          <Input
            id="credential-camera-fallback-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handleFileInputChange(event)}
          />
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        {mode === "live" && onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
        )}
        {mode === "live" && (
          <Button
            type="button"
            className="flex-1"
            disabled={isCapturing}
            onClick={() => void handleCapture()}
          >
            {isCapturing ? "Capturando…" : "Tomar foto"}
          </Button>
        )}
      </div>
    </div>
  );
}
