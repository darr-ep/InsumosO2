import { describe, expect, it } from "vitest";
import { rentalEditSchema, paymentEditSchema } from "@/domain/rentals/rentalEdit";

describe("rentalEditSchema", () => {
  it("accepts valid rental edit values", () => {
    const result = rentalEditSchema.safeParse({
      items: [{ item_type: "concentrator", quantity: 1 }],
      initial_rent_amount: 2800,
      deposit_amount: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty items list", () => {
    const result = rentalEditSchema.safeParse({
      items: [],
      initial_rent_amount: 2800,
      deposit_amount: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive initial rent amount", () => {
    const result = rentalEditSchema.safeParse({
      items: [{ item_type: "tank", quantity: 1 }],
      initial_rent_amount: 0,
      deposit_amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative deposit amount", () => {
    const result = rentalEditSchema.safeParse({
      items: [{ item_type: "concentrator", quantity: 2 }],
      initial_rent_amount: 3000,
      deposit_amount: -500,
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentEditSchema", () => {
  it("accepts valid payment edit values", () => {
    const result = paymentEditSchema.safeParse({
      amount: 1500,
      note: "Pago parcial",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payment edit without note", () => {
    const result = paymentEditSchema.safeParse({
      amount: 2800,
    });
    expect(result.success).toBe(true);
  });

  it("rejects payment edit with amount <= 0", () => {
    const result = paymentEditSchema.safeParse({
      amount: 0,
    });
    expect(result.success).toBe(false);
  });
});
