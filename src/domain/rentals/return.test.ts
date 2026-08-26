import { describe, expect, it } from "vitest";
import { returnFormSchema, suggestedDepositReturn } from "@/domain/rentals/return";

describe("returnFormSchema (§20, CU6)", () => {
  it("accepts non-negative amount_collected and deposit_returned, note optional", () => {
    const result = returnFormSchema.safeParse({
      amount_collected: 2800,
      deposit_returned: 1000,
    });

    expect(result.success).toBe(true);
  });

  it("accepts amount_collected = 0 (no final payment to register)", () => {
    expect(
      returnFormSchema.safeParse({ amount_collected: 0, deposit_returned: 0 })
        .success,
    ).toBe(true);
  });

  it("rejects negative amount_collected or deposit_returned", () => {
    expect(
      returnFormSchema.safeParse({
        amount_collected: -1,
        deposit_returned: 0,
      }).success,
    ).toBe(false);
    expect(
      returnFormSchema.safeParse({
        amount_collected: 0,
        deposit_returned: -1,
      }).success,
    ).toBe(false);
  });
});

describe("suggestedDepositReturn (§7.3, CU6)", () => {
  it("defaults to the full deposit captured at Nueva renta", () => {
    expect(suggestedDepositReturn(1000)).toBe(1000);
    expect(suggestedDepositReturn(0)).toBe(0);
  });
});
