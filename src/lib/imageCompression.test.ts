import { describe, expect, it } from "vitest";
import {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_WIDTH_PX,
  computeCompressedDimensions,
} from "@/lib/imageCompression";

/**
 * Feature: Credential Photo Camera + Compression (Batch 1) — business
 * owner's UX request, outside the original MVP+redesign scope. §-refs don't
 * apply here since this isn't SDD.md-sourced; this is a new feature.
 *
 * `compressImage` itself (the actual `createImageBitmap` + canvas
 * draw/`toBlob` execution) is intentionally NOT covered here, for the exact
 * same reason `loadAndDither`/`ditheredImageToDataUrl` aren't covered in
 * `imageEscpos.test.ts`: jsdom's `canvas.getContext('2d')` returns `null`
 * without the native `canvas` npm package (confirmed, not installed — a
 * native build dependency, out of scope). `computeCompressedDimensions` —
 * the actual size-calculation math `compressImage` depends on — is a pure
 * function of plain numbers and is fully covered below, same pattern as
 * `imageEscpos.ts`'s `floydSteinbergDither`/`findContentBoundingBox`.
 */
describe("computeCompressedDimensions (size math for compressImage)", () => {
  it("uses DEFAULT_MAX_WIDTH_PX (1200) when no maxWidthPx is given", () => {
    const result = computeCompressedDimensions({ width: 3000, height: 2000 });

    expect(result.width).toBe(DEFAULT_MAX_WIDTH_PX);
  });

  it("downscales a landscape image, preserving aspect ratio", () => {
    const result = computeCompressedDimensions({ width: 4000, height: 3000 }, { maxWidthPx: 1200 });

    expect(result).toEqual({ width: 1200, height: 900 });
  });

  it("downscales a portrait image (credential photo shot vertically), preserving aspect ratio", () => {
    const result = computeCompressedDimensions({ width: 3000, height: 4000 }, { maxWidthPx: 1200 });

    expect(result).toEqual({ width: 1200, height: 1600 });
  });

  it("never upscales when the source is already smaller than maxWidthPx", () => {
    const result = computeCompressedDimensions({ width: 800, height: 600 }, { maxWidthPx: 1200 });

    expect(result).toEqual({ width: 800, height: 600 });
  });

  it("returns the source dimensions unchanged when width equals maxWidthPx exactly (triangulation)", () => {
    const result = computeCompressedDimensions({ width: 1200, height: 900 }, { maxWidthPx: 1200 });

    expect(result).toEqual({ width: 1200, height: 900 });
  });

  it("rounds a fractional resulting height to the nearest integer (triangulation)", () => {
    const result = computeCompressedDimensions({ width: 1000, height: 333 }, { maxWidthPx: 300 });

    // 333 * (300/1000) = 99.9 -> rounds to 100
    expect(result).toEqual({ width: 300, height: 100 });
  });

  it("respects a custom maxWidthPx override", () => {
    const result = computeCompressedDimensions({ width: 2000, height: 1000 }, { maxWidthPx: 500 });

    expect(result).toEqual({ width: 500, height: 250 });
  });
});

describe("compressImage defaults", () => {
  it("exports a sensible default JPEG quality (legible but meaningfully smaller than an uncompressed phone photo)", () => {
    expect(DEFAULT_JPEG_QUALITY).toBeGreaterThan(0);
    expect(DEFAULT_JPEG_QUALITY).toBeLessThan(1);
    expect(DEFAULT_JPEG_QUALITY).toBe(0.82);
  });
});
