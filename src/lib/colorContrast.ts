/**
 * Pure OKLCH -> WCAG relative-luminance / contrast-ratio helpers.
 *
 * `src/index.css` documents its palette as "verified via an OKLCH->linear-sRGB
 * ->relative-luminance script, not eyeballed" (see its own `--primary`
 * comment). This module IS that script, made reusable and test-covered so
 * future token edits stay provably WCAG AA-compliant instead of relying on
 * a one-off calculation. See `src/index.css.contrast.test.ts` for the
 * acceptance-level checks that read the live token values from `index.css`.
 *
 * The OKLab<->linear-sRGB matrices are Björn Ottosson's published OKLab
 * constants (https://bottosson.github.io/posts/oklab/).
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

/** Parses a CSS `oklch(L C H)` string into its numeric components. */
export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Not a valid oklch() color: "${value}"`);
  }
  const [, l, c, h] = match;
  return { l: Number(l), c: Number(c), h: Number(h) };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Converts OKLCH to LINEAR sRGB (not gamma-encoded), clamped to [0, 1]. */
export function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return [clamp01(r), clamp01(g), clamp01(blue)];
}

/**
 * WCAG relative luminance from LINEAR sRGB channels (0-1). Note this is the
 * WCAG 2.x formula's own linearization target — `oklchToLinearRgb` already
 * outputs linear values, so no additional gamma decoding step is needed.
 */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "").trim();
  const r8 = parseInt(cleanHex.slice(0, 2), 16);
  const g8 = parseInt(cleanHex.slice(2, 4), 16);
  const b8 = parseInt(cleanHex.slice(4, 6), 16);

  function sRgbToLinear(c: number): number {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }

  return [sRgbToLinear(r8), sRgbToLinear(g8), sRgbToLinear(b8)];
}

/** WCAG contrast ratio between two relative luminances (order-independent). */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG contrast ratio between two CSS color strings (oklch or #hex). */
export function oklchContrastRatio(a: string, b: string): number {
  const linearA = a.startsWith("#") ? hexToLinearRgb(a) : oklchToLinearRgb(parseOklch(a));
  const linearB = b.startsWith("#") ? hexToLinearRgb(b) : oklchToLinearRgb(parseOklch(b));
  const luminanceA = relativeLuminance(linearA);
  const luminanceB = relativeLuminance(linearB);
  return contrastRatio(luminanceA, luminanceB);
}
