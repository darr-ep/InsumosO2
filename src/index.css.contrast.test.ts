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
  const pattern = new RegExp(`--${token}:\\s*(oklch\\([^;]+\\));`);
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

  it("keeps --success text on --success-soft at or above WCAG AA (4.5:1)", () => {
    const ratio = oklchContrastRatio(
      extractToken(root, "success"),
      extractToken(root, "success-soft"),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves .dark's --muted-foreground untouched (frozen per #2218-3)", () => {
    const dark = extractBlock(".dark");
    expect(extractToken(dark, "muted-foreground")).toBe("oklch(0.708 0 0)");
  });
});
