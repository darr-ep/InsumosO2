import { describe, expect, it } from "vitest";
import { oklchContrastRatio } from "@/lib/colorContrast";
// Vite's `?raw` suffix imports the file as a plain string (no Node `fs`
// needed — keeps this test runnable under the same bundler-mode
// moduleResolution the rest of the app uses).
import CSS_TEXT from "./index.css?raw";

/**
 * Extracts a `--token: oklch(L C H);` value from a given `{ ... }` CSS block
 * (either `:root { ... }` or `.dark { ... }`). Throws if the token is
 * missing so a regression (typo, removed token) fails loudly instead of
 * silently comparing `undefined` values.
 */
function extractToken(block: string, token: string): string {
  const pattern = new RegExp(`--${token}:\\s*([^;]+);`);
  const match = pattern.exec(block);
  if (!match) {
    throw new Error(`Token --${token} not found in the given CSS block`);
  }
  return match[1].replace(/\s+/g, " ").trim();
}

function extractBlock(name: ":root" | ".dark"): string {
  const pattern = new RegExp(`${name.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(CSS_TEXT);
  if (!match) {
    throw new Error(`Block ${name} not found in src/index.css`);
  }
  return match[1];
}

describe("src/index.css light-theme contrast (design #2224 A1/A2)", () => {
  const root = extractBlock(":root");

  it("keeps --muted-foreground on --background at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(root, "muted-foreground"),
      extractToken(root, "background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --primary text on a pure white surface at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(extractToken(root, "primary"), "oklch(1 0 0)");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --primary text on --primary-soft at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(root, "primary"),
      extractToken(root, "primary-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --success text on --success-soft at or above UI badge threshold (3.0:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(root, "success"),
      extractToken(root, "success-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("keeps --warning-soft-foreground on --warning-soft at or above WCAG AA (4.5:1)", () => {
    // --warning itself only clears 1.90:1 here (it's tuned as a background
    // color, not foreground text) — --warning-soft-foreground is the
    // dedicated text token for this pairing instead.
    const ratio = oklchContrastRatio(
      extractToken(root, "warning-soft-foreground"),
      extractToken(root, "warning-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

});

describe("src/index.css dark-theme contrast (Pencil MCP 'Sistema de tokens · modo oscuro')", () => {
  const dark = extractBlock(".dark");

  it("keeps --foreground on --background at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "foreground"), extractToken(dark, "background"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --foreground on --card at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "foreground"), extractToken(dark, "card"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --muted-foreground on --background at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "muted-foreground"),
      extractToken(dark, "background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --primary-foreground on --primary at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "primary-foreground"),
      extractToken(dark, "primary"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --primary text on --primary-soft at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "primary"), extractToken(dark, "primary-soft"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --success-foreground on --success at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "success-foreground"),
      extractToken(dark, "success"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --success text on --success-soft at or above UI badge threshold (3.0:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "success"), extractToken(dark, "success-soft"));
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("keeps --warning-foreground on --warning at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "warning-foreground"),
      extractToken(dark, "warning"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --warning text on --warning-soft at or above UI badge threshold (3.0:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "warning"), extractToken(dark, "warning-soft"));
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("keeps --warning-soft-foreground on --warning-soft at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "warning-soft-foreground"),
      extractToken(dark, "warning-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --destructive text on --destructive-soft at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(dark, "destructive"),
      extractToken(dark, "destructive-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --ring visible against --background at or above the non-text UI threshold (3.0:1)", () => {
    const ratio = oklchContrastRatio(extractToken(dark, "ring"), extractToken(dark, "background"));
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });
});

describe("src/index.css shared light/dark tokens (design's disabled-text exemption)", () => {
  // WCAG 1.4.3 exempts text that is part of an inactive/disabled UI
  // component from the normal-text AA floor — --foreground-disabled is only
  // ever used for that state, so these checks confirm it's still legible
  // enough to read (not the full 4.5:1 bar), rather than enforcing AA.
  it("keeps light --foreground-disabled at least minimally legible on --background (>= 2.0:1)", () => {
    const root = extractBlock(":root");
    const ratio = oklchContrastRatio(
      extractToken(root, "foreground-disabled"),
      extractToken(root, "background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });

  it("keeps dark --foreground-disabled at least minimally legible on --background (>= 2.0:1)", () => {
    const dark = extractBlock(".dark");
    const ratio = oklchContrastRatio(
      extractToken(dark, "foreground-disabled"),
      extractToken(dark, "background"),
    );
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });
});
