import { describe, expect, it } from "vitest";
import {
  ID_CARD_ASPECT_RATIO,
  computeCenterCropRect,
  toJpegFilename,
} from "@/lib/credentialCameraCrop";

/**
 * Feature: Credential Photo Camera + Compression (Batch 2). Pure crop math
 * consumed by `CredentialCameraCapture.tsx`'s `captureVideoFrameAsBlob` —
 * kept fully unit-testable without any canvas/video machinery, same
 * separation pattern as `imageCompression.test.ts`'s
 * `computeCompressedDimensions`.
 */
describe("computeCenterCropRect (crop math for CredentialCameraCapture)", () => {
  it("crops left/right when the source is wider than the target aspect ratio", () => {
    const result = computeCenterCropRect(1600, 800, 1);

    expect(result).toEqual({ sx: 400, sy: 0, sWidth: 800, sHeight: 800 });
  });

  it("crops top/bottom when the source is taller than the target aspect ratio", () => {
    const result = computeCenterCropRect(800, 1600, 1);

    expect(result).toEqual({ sx: 0, sy: 400, sWidth: 800, sHeight: 800 });
  });

  it("returns the full frame unchanged when the aspect ratios already match (triangulation)", () => {
    const result = computeCenterCropRect(800, 400, 2);

    expect(result).toEqual({ sx: 0, sy: 0, sWidth: 800, sHeight: 400 });
  });

  it("exports the ID-1 card aspect ratio (~1.5852, same as a Mexican INE credential)", () => {
    expect(ID_CARD_ASPECT_RATIO).toBeCloseTo(1.5852, 3);
  });
});

describe("toJpegFilename", () => {
  it("replaces an existing extension with .jpg", () => {
    expect(toJpegFilename("credencial.png")).toBe("credencial.jpg");
  });

  it("appends .jpg when there is no extension", () => {
    expect(toJpegFilename("credencial")).toBe("credencial.jpg");
  });

  it("falls back to a default base name for an empty input (triangulation)", () => {
    expect(toJpegFilename("")).toBe("credencial.jpg");
  });
});
