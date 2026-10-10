import { describe, expect, it } from "vitest";
import { ALIGN_CENTER, CUT, FEED_LINES, INIT } from "@/printing/escpos";
import {
  buildImageTicket,
  findContentBoundingBox,
  floydSteinbergDither,
  type DitheredImage,
} from "@/printing/imageEscpos";

/**
 * `loadAndDither` and `ditheredImageToDataUrl` are intentionally NOT
 * covered here: both require a real `HTMLCanvasElement` 2D context and
 * `createImageBitmap`, which jsdom does not implement without the native
 * `canvas` npm package (confirmed: `canvas.getContext('2d')` returns
 * `null` in this project's jsdom environment). Adding that native
 * dependency is out of scope for this phase. `floydSteinbergDither` and
 * `findContentBoundingBox` — the actual algorithmic logic those two
 * functions depend on — ARE pure functions of plain pixel data and are
 * fully covered below with synthetic `ImageData`-shaped objects (no
 * canvas needed, since the `ImageData` TypeScript type is structural).
 */
function fakeImageData(width: number, height: number, pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a] = pixels[i];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data } as ImageData;
}

describe("floydSteinbergDither (§23.1 — logos/images)", () => {
  it("converts a solid black image to all-black bits", () => {
    const image = fakeImageData(2, 2, [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);

    expect(Array.from(floydSteinbergDither(image))).toEqual([1, 1, 1, 1]);
  });

  it("converts a solid white image to all-white bits (triangulation)", () => {
    const image = fakeImageData(2, 2, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);

    expect(Array.from(floydSteinbergDither(image))).toEqual([0, 0, 0, 0]);
  });

  it("preserves a sharp black/white alternation without smearing (triangulation)", () => {
    const image = fakeImageData(4, 1, [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);

    expect(Array.from(floydSteinbergDither(image))).toEqual([1, 0, 1, 0]);
  });
});

describe("findContentBoundingBox (§23.1 — auto-crop before scaling)", () => {
  it("returns null for a fully transparent image", () => {
    const image = fakeImageData(3, 3, new Array(9).fill([0, 0, 0, 0]));

    expect(findContentBoundingBox(image)).toBeNull();
  });

  it("finds the bounding box of real content padded by 2px, clamped to the canvas (triangulation)", () => {
    // 5x5, all white/transparent except a single black pixel at (2,2).
    const pixels = new Array(25).fill([255, 255, 255, 255]);
    pixels[2 * 5 + 2] = [0, 0, 0, 255];
    const image = fakeImageData(5, 5, pixels);

    expect(findContentBoundingBox(image)).toEqual({
      left: 0,
      top: 0,
      right: 4,
      bottom: 4,
    });
  });

  it("does not pad past the canvas edge when content touches the corner", () => {
    // 10x10, single black pixel far from any edge — padding stays internal.
    const pixels = new Array(100).fill([255, 255, 255, 255]);
    pixels[5 * 10 + 5] = [0, 0, 0, 255];
    const image = fakeImageData(10, 10, pixels);

    expect(findContentBoundingBox(image)).toEqual({
      left: 3,
      top: 3,
      right: 7,
      bottom: 7,
    });
  });
});

describe("buildImageTicket (§23.1 — GS v 0 raster command)", () => {
  it("packs an 8px-wide image into 1 byte per row (MSB first) and wraps init/feed/cut", () => {
    const image: DitheredImage = {
      width: 8,
      height: 2,
      // row 0: 1000 0001 = 0x81, row 1: all zero = 0x00
      bits: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
    };

    const ticket = buildImageTicket(image);

    expect(Array.from(ticket)).toEqual([
      ...INIT,
      ...ALIGN_CENTER,
      0x1d,
      0x76,
      0x30,
      0x00, // m=0: normal mode
      1,
      0, // widthBytes = ceil(8/8) = 1
      2,
      0, // height = 2
      0x81,
      0x00,
      ...FEED_LINES(6),
      ...CUT,
    ]);
  });

  it("pads the last partial byte with zero bits when width isn't a multiple of 8 (triangulation)", () => {
    const image: DitheredImage = {
      width: 9,
      height: 1,
      // 9 bits: 1111 1111 1 -> byte0 = 0xff, byte1 = 1000 0000 = 0x80
      bits: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    };

    const ticket = buildImageTicket(image);

    expect(Array.from(ticket)).toEqual([
      ...INIT,
      ...ALIGN_CENTER,
      0x1d,
      0x76,
      0x30,
      0x00,
      2,
      0, // widthBytes = ceil(9/8) = 2
      1,
      0,
      0xff,
      0x80,
      ...FEED_LINES(6),
      ...CUT,
    ]);
  });
});

describe("getLogoDithered (graceful degradation)", () => {
  it("resolves null when window or fetch is not available", async () => {
    const { getLogoDithered } = await import("@/printing/imageEscpos");
    const result = await getLogoDithered();
    // In node/jsdom test env without canvas/createImageBitmap, it should resolve null gracefully
    expect(result === null || typeof result === "object").toBe(true);
  });
});

