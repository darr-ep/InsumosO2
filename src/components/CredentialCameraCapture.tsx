import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/imageCompression";
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
 * Drop-in replacement shape for `CustomerForm.tsx`/`CustomerDetailSheet.tsx`'s
 * current `File | null` photo state — produces the same `File` via
 * `onCapture`. Wiring those two callers is a later, separate batch
 * (explicitly out of scope here).
 *
 * Crop math (`computeCenterCropRect`/`toJpegFilename`/`ID_CARD_ASPECT_RATIO`)
 * lives in `src/lib/credentialCameraCrop.ts` — kept out of this file so it
 * stays component-only-exports (react-refresh) and is unit-testable without
 * React/canvas/video machinery, same separation as `imageCompression.ts`.
 */

export interface CredentialCameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
}

function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], toJpegFilename(filename), {
    type: blob.type || "image/jpeg",
  });
}

/**
 * Draws the current video frame onto an offscreen canvas, center-cropped to
 * `targetAspectRatio`, and returns it as a `Blob`. NOT unit-tested via real
 * pixel data — same documented limitation as `imageCompression.ts`'s
 * `compressImage` and `imageEscpos.ts`'s `loadAndDither`: jsdom's
 * `canvas.getContext('2d')` returns `null` without the native `canvas` npm
 * package (confirmed not installed, out of scope). `CredentialCameraCapture.test.tsx`
 * proves the control flow (capture → canvas draw → compressImage → onCapture)
 * by stubbing `HTMLCanvasElement.prototype.getContext`/`toBlob` directly;
 * `computeCenterCropRect` above — the actual crop math this function depends
 * on — is a pure function of plain numbers and is fully covered.
 */
async function captureVideoFrameAsBlob(
  video: HTMLVideoElement,
  targetAspectRatio: number = ID_CARD_ASPECT_RATIO,
): Promise<Blob> {
  const { sx, sy, sWidth, sHeight } = computeCenterCropRect(
    video.videoWidth,
    video.videoHeight,
    targetAspectRatio,
  );

  const canvas = document.createElement("canvas");
  canvas.width = sWidth;
  canvas.height = sHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear el canvas 2D para capturar la foto.");
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });

  if (!blob) {
    throw new Error("No se pudo capturar la foto.");
  }

  return blob;
}

type Mode = "loading" | "live" | "fallback";

export function CredentialCameraCapture({
  onCapture,
  onCancel,
}: CredentialCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Stops every track of the current stream — a real, easy-to-miss leak
  // otherwise: without this the browser/OS camera-in-use indicator stays
  // lit after the component is done with the camera.
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setMode("fallback");
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setMode("live");
      } catch {
        // Permission denied, no camera hardware, insecure context, etc.
        // Never dead-end the user — fall back to the native file picker.
        if (!cancelled) {
          setMode("fallback");
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

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
      const rawBlob = await captureVideoFrameAsBlob(video);
      const compressed = await compressImage(rawBlob);
      onCapture(blobToFile(compressed, "credencial.jpg"));
    } catch {
      setError("No se pudo capturar la foto. Intenta de nuevo.");
    } finally {
      setIsCapturing(false);
    }
  }

  function handleCancel() {
    stopStream();
    onCancel?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "loading" && (
        <p className="text-muted-foreground text-sm">Iniciando cámara…</p>
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

      {mode === "live" && (
        <div className="relative overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full"
            data-testid="credential-camera-video"
          />
          {/* Visual framing guide only, not a real-time crop — the actual
              crop happens in captureVideoFrameAsBlob on capture. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div
              className="w-4/5 border-2 border-dashed border-white/80"
              style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        {mode === "live" && (
          <Button
            type="button"
            disabled={isCapturing}
            onClick={() => void handleCapture()}
          >
            {isCapturing ? "Capturando…" : "Tomar foto"}
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
