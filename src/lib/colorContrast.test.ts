import { describe, expect, it } from "vitest";
import { contrastRatio, oklchContrastRatio, parseOklch } from "@/lib/colorContrast";

describe("parseOklch", () => {
  it("parses an oklch() string into its L/C/H components", () => {
    expect(parseOklch("oklch(0.55 0.20 254)")).toEqual({ l: 0.55, c: 0.2, h: 254 });
  });

  it("parses a zero-chroma grayscale oklch() string", () => {
    expect(parseOklch("oklch(0.145 0 0)")).toEqual({ l: 0.145, c: 0, h: 0 });
  });

  it("throws on a non-oklch input", () => {
    expect(() => parseOklch("#2563EB")).toThrow(/oklch/i);
  });
});

describe("contrastRatio", () => {
  it("returns the WCAG-standard 21:1 ceiling for absolute black vs absolute white", () => {
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 2);
  });

  it("returns 1:1 for two identical luminances (no contrast)", () => {
    expect(contrastRatio(0.42, 0.42)).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio(0.2, 0.8)).toBeCloseTo(contrastRatio(0.8, 0.2), 10);
  });
});

describe("oklchContrastRatio", () => {
  it("computes ~21:1 between oklch pure black and pure white", () => {
    expect(oklchContrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
  });

  it("computes ~4.60:1 for the new --muted-foreground on the new --background", () => {
    // Design #2224 A2: oklch(0.54 0 0) on oklch(0.967 0.002 265) must clear WCAG AA (4.5:1).
    const ratio = oklchContrastRatio("oklch(0.54 0 0)", "oklch(0.967 0.002 265)");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(4.6, 1);
  });

  it("returns 1 for the same color compared to itself", () => {
    expect(oklchContrastRatio("oklch(0.5 0.1 200)", "oklch(0.5 0.1 200)")).toBeCloseTo(1, 5);
  });
});
