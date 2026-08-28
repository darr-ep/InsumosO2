/**
 * Feature: Credential Photo Camera + Compression (Batch 1) — business
 * owner's UX request ("Credential Photo: Compression + Live Camera
 * Capture"), outside the original MVP+redesign scope. This is a foundational
 * building block only: NOT yet wired into `CustomerForm.tsx` /
 * `CustomerDetailSheet.tsx` (later batches). This is an internal business
 * tool, not a photo studio — legibility matters more than pixel-perfect
 * quality, so the defaults favor a meaningfully smaller upload over max
 * fidelity.
 *
 * Canvas-setup style matches the established precedent in
 * `src/printing/imageEscpos.ts` (`loadAndDither`) — load via
 * `createImageBitmap`, draw into an offscreen `<canvas>`, read back out.
 * This is a different transform (resize + re-encode vs. dither), but the
 * surrounding canvas boilerplate intentionally mirrors that file rather
 * than reinventing it.
 */

export interface Dimensions {
  width: number;
  height: number;
}

export interface ComputeCompressedDimensionsOptions {
  maxWidthPx?: number;
}

export interface CompressImageOptions {
  maxWidthPx?: number;
  quality?: number;
}

// 1200px is a legible width for a scanned ID card at typical phone-camera
// resolutions (which are often 3000-4000px wide) while being a meaningful
// reduction in both pixel count and re-encoded JPEG size.
export const DEFAULT_MAX_WIDTH_PX = 1200;

// Legible but meaningfully smaller than an uncompressed phone-camera JPEG
// (which can be 3-8MB) — this is an internal business tool, not a photo
// studio.
export const DEFAULT_JPEG_QUALITY = 0.82;

/**
 * Pure size-calculation math: given a source image's native dimensions and
 * a max width, what should the output dimensions be? Never upscales (if the
 * source is already smaller than `maxWidthPx`, it's returned unchanged) and
 * always preserves aspect ratio. Deliberately separated from
 * `compressImage`'s canvas execution so this logic is fully unit-testable
 * without a real `<canvas>` — see `imageCompression.test.ts` for why the
 * canvas part itself isn't (same reasoning as
 * `imageEscpos.ts`'s `loadAndDither`, documented in `imageEscpos.test.ts`).
 */
export function computeCompressedDimensions(
  source: Dimensions,
  options?: ComputeCompressedDimensionsOptions,
): Dimensions {
  const maxWidthPx = options?.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX;

  if (source.width <= maxWidthPx) {
    return { width: source.width, height: source.height };
  }

  const scale = maxWidthPx / source.width;
  return {
    width: maxWidthPx,
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * Resizes (down only, never up) and re-encodes `source` as a JPEG, to
 * reduce storage usage in PocketBase and keep the upload request lighter.
 * Client-side only — the existing `credential_photo` file field just
 * receives this smaller `Blob` instead of the original, no server changes
 * needed.
 *
 * NOT unit-tested directly: this function's actual work — `createImageBitmap`
 * + `canvas.getContext('2d')` + `canvas.toBlob` — requires real browser
 * canvas support that jsdom does not provide without the native `canvas`
 * npm package (confirmed not installed here, a native build dependency, out
 * of scope). Its pure math (`computeCompressedDimensions`) is fully covered
 * in `imageCompression.test.ts`; `CredentialCameraCapture.test.tsx` covers
 * this function's *wiring* into the capture flow by mocking it directly,
 * for the same reason.
 */
export async function compressImage(
  source: Blob,
  options?: CompressImageOptions,
): Promise<Blob> {
  const maxWidthPx = options?.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;

  const bitmap = await createImageBitmap(source);
  const { width, height } = computeCompressedDimensions(
    { width: bitmap.width, height: bitmap.height },
    { maxWidthPx },
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear el canvas 2D para comprimir la imagen.");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("No se pudo comprimir la imagen.");
  }

  return blob;
}
