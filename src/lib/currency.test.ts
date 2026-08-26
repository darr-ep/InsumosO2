import { describe, expect, it } from "vitest";
import { formatCurrencyMXN } from "@/lib/currency";

describe("formatCurrencyMXN", () => {
  it("formats a positive amount as MXN currency", () => {
    expect(formatCurrencyMXN(2800)).toBe("$2,800.00");
  });

  it("formats a negative amount (adjustment correction, §11.2)", () => {
    expect(formatCurrencyMXN(-200)).toBe("-$200.00");
  });

  it("formats zero", () => {
    expect(formatCurrencyMXN(0)).toBe("$0.00");
  });
});
