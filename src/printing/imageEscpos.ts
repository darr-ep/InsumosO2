import { CUT, FEED_LINES, INIT, concatBytes } from "@/printing/escpos";

/**
 * SDD.md §23.1 (image printing via `GS v 0` + Floyd-Steinberg dithering,
 * confirmed against the WW-POS58U in the discardable `test-impresora`
 * prototype). Ported for task 5.2. Not currently wired into any receipt —
 * §22's printed content is text-only (folio/cliente/items/total); "logo
 * (si existe)" is a requirement of the on-screen HTML modal
 * (`ReceiptDialog`), not the thermal ticket. This module stays available
 * as a validated building block if a future phase adds a logo to the
 * printed ticket.
 */
export interface DitheredImage {
  width: number;
  height: number;
  bits: Uint8Array; // 1 byte per pixel: 1 = print black, 0 = white. Row-major.
}

// Thermal ESC/POS printers only print black/white (1-bit), not grayscale.
// Floyd-Steinberg is the standard algorithm to convert a photo/logo to
// 1-bit without visible blocking — pure browser-side processing, nothing
// proprietary to the hardware.
export function floydSteinbergDither(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = gray[idx];
      const isBlack = old < 128;
      bits[idx] = isBlack ? 1 : 0;
      const error = old - (isBlack ? 0 : 255);

      if (x + 1 < width) gray[idx + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[idx + width - 1] += (error * 3) / 16;
        gray[idx + width] += (error * 5) / 16;
        if (x + 1 < width) gray[idx + width + 1] += (error * 1) / 16;
      }
    }
  }
  return bits;
}

export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A thermal printer's print time for an image depends on how many raster
 * ROWS are sent, regardless of whether they're black or white — the
 * printhead sweeps every row either way. A blank/transparent margin
 * around a logo (common in an exported PNG) inflates the image with
 * nothing visible to show for it — confirmed against the WW-POS58U in
 * the prototype ("tarda en las zonas blancas"). Cropping to the real
 * content bounding box before scaling avoids that.
 */
export function findContentBoundingBox(imageData: ImageData): BoundingBox | null {
  const { width, height, data } = imageData;
  const ALPHA_THRESHOLD = 10; // near-transparent -> counts as background
  const LUMA_THRESHOLD = 250; // near-white -> counts as background
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < ALPHA_THRESHOLD) continue;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma > LUMA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return null; // fully white/transparent
  const pad = 2; // small margin so antialiased edges don't get clipped
  return {
    left: Math.max(0, left - pad),
    top: Math.max(0, top - pad),
    right: Math.min(width - 1, right + pad),
    bottom: Math.min(height - 1, bottom + pad),
  };
}

/**
 * 384px is the conventional print width for a 58mm thermal head at
 * 203dpi — an industry convention, NOT a confirmed exact maximum for the
 * WW-POS58U (§23.5 — pending). Kept editable by the caller for that
 * reason.
 */
export async function loadAndDither(file: File, targetWidthPx: number): Promise<DitheredImage> {
  const bitmap = await createImageBitmap(file);

  // Analyzed at the file's native resolution first, so cropping doesn't
  // lose precision before the image is reduced to the print width.
  const nativeCanvas = document.createElement("canvas");
  nativeCanvas.width = bitmap.width;
  nativeCanvas.height = bitmap.height;
  const nativeCtx = nativeCanvas.getContext("2d");
  if (!nativeCtx) throw new Error("No se pudo crear el canvas 2D para analizar la imagen.");
  nativeCtx.drawImage(bitmap, 0, 0);
  const nativeData = nativeCtx.getImageData(0, 0, bitmap.width, bitmap.height);

  const bbox = findContentBoundingBox(nativeData);
  const cropX = bbox ? bbox.left : 0;
  const cropY = bbox ? bbox.top : 0;
  const cropWidth = bbox ? bbox.right - bbox.left + 1 : bitmap.width;
  const cropHeight = bbox ? bbox.bottom - bbox.top + 1 : bitmap.height;

  const width = Math.max(8, Math.round(targetWidthPx));
  const height = Math.max(1, Math.round(width * (cropHeight / cropWidth)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el canvas 2D para procesar la imagen.");

  // Explicit white background: if the PNG has transparency, without this
  // the dithering would treat alpha=0 as black (RGB usually comes as 0,0,0).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const bits = floydSteinbergDither(imageData);
  return { width, height, bits };
}

export function ditheredImageToDataUrl(img: DitheredImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < img.bits.length; i++) {
    const v = img.bits[i] ? 0 : 255;
    out.data[i * 4] = v;
    out.data[i * 4 + 1] = v;
    out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL();
}

// GS v 0 m xL xH yL yH d1...dk — standard ESC/POS raster bit image
// command (not vendor-specific — in Epson's own datasheet and replicated
// by practically every clone).
function packRaster(img: DitheredImage): Uint8Array {
  const widthBytes = Math.ceil(img.width / 8);
  const raster = new Uint8Array(widthBytes * img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.bits[y * img.width + x]) {
        raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00, // m=0: normal mode
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    img.height & 0xff,
    (img.height >> 8) & 0xff,
  ]);
  return concatBytes([header, raster]);
}

export function buildImageTicket(img: DitheredImage): Uint8Array {
  return concatBytes([INIT, packRaster(img), FEED_LINES(3), CUT]);
}
