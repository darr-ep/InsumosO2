import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAutoPrintEnabled, setAutoPrintEnabled } from "@/printing/printSettings";

describe("printSettings — auto-print preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to true when nothing is stored", () => {
    expect(isAutoPrintEnabled()).toBe(true);
  });

  it("persists false after setAutoPrintEnabled(false)", () => {
    setAutoPrintEnabled(false);

    expect(isAutoPrintEnabled()).toBe(false);
  });

  it("flips back to true after setAutoPrintEnabled(true)", () => {
    setAutoPrintEnabled(false);
    setAutoPrintEnabled(true);

    expect(isAutoPrintEnabled()).toBe(true);
  });

  it("fails open to true if localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(isAutoPrintEnabled()).toBe(true);
  });

  it("does not throw if localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => setAutoPrintEnabled(false)).not.toThrow();
  });
});
