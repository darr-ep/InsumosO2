/**
 * Feature: Credential Photo Camera + Compression (Batch 2) — pure crop math
 * consumed by `src/components/CredentialCameraCapture.tsx`. Split into its
 * own `lib/` file (rather than living inside the component file) for two
 * reasons: it keeps this logic testable without any React/canvas/video
 * machinery (same separation `imageCompression.ts` uses for
 * `computeCompressedDimensions`), and it keeps `CredentialCameraCapture.tsx`
 * a component-only export, satisfying `react-refresh/only-export-components`.
 */

// Standard ID-1 card proportions (same as a Mexican INE credential):
// 85.6mm x 54mm ~= 1.5852:1.
export const ID_CARD_ASPECT_RATIO = 85.6 / 54;

export interface CropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * Pure center-crop math: given a source frame's native dimensions and a
 * target aspect ratio, what rectangle (in source-pixel coordinates) should
 * be drawn onto the output canvas? A live camera stream's native aspect
 * ratio essentially never matches the ID-card guide overlay's aspect ratio,
 * so this is what makes the captured photo actually match what the guide
 * visually promised the user, instead of just stretching/distorting it.
 */
export function computeCenterCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: number,
): CropRect {
  const sourceAspectRatio = sourceWidth / sourceHeight;

  if (sourceAspectRatio > targetAspectRatio) {
    // Source is relatively wider than the target — crop the left/right
    // edges, keep the full height.
    const sWidth = sourceHeight * targetAspectRatio;
    return {
      sx: (sourceWidth - sWidth) / 2,
      sy: 0,
      sWidth,
      sHeight: sourceHeight,
    };
  }

  // Source is relatively taller than (or exactly equal to) the target —
  // crop the top/bottom edges, keep the full width.
  const sHeight = sourceWidth / targetAspectRatio;
  return {
    sx: 0,
    sy: (sourceHeight - sHeight) / 2,
    sWidth: sourceWidth,
    sHeight,
  };
}

/**
 * Renames a filename's extension to `.jpg` — `compressImage` always
 * re-encodes to JPEG (see `imageCompression.ts`), so the resulting `File`
 * should carry a matching extension regardless of what the source file (or
 * the live-capture placeholder name) was named.
 */
export function toJpegFilename(originalName: string): string {
  const base = originalName.replace(/\.[^./]+$/, "");
  return `${base || "credencial"}.jpg`;
}
