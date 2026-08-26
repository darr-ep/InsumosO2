import { describe, expect, it } from "vitest";
import {
  rentalFormSchema,
  rentalItemTypeLabel,
  shouldRegisterDepositPayment,
} from "@/domain/rentals/rental";

describe("rentalFormSchema (§20, §16.7)", () => {
  const base = {
    customer_id: "cust1",
    items: [{ item_type: "concentrator" as const, quantity: 1 }],
    initial_rent_amount: 2800,
    deposit_amount: 1000,
    extras: [],
  };

  it("accepts a well-formed rental", () => {
    expect(rentalFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a rental with no items (must select at least one product)", () => {
    const result = rentalFormSchema.safeParse({ ...base, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative initial_rent_amount", () => {
    const result = rentalFormSchema.safeParse({
      ...base,
      initial_rent_amount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an item quantity below 1", () => {
    const result = rentalFormSchema.safeParse({
      ...base,
      items: [{ item_type: "tank", quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an extras entry with an empty description", () => {
    const result = rentalFormSchema.safeParse({
      ...base,
      extras: [{ description: "", price: 50 }],
    });
    expect(result.success).toBe(false);
  });

  it("never accepts folio or status as part of the form (they aren't fields of this schema)", () => {
    const parsed = rentalFormSchema.parse(base);
    expect(parsed).not.toHaveProperty("folio");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("rentalItemTypeLabel (§16.14 microcopy)", () => {
  it("labels concentrator and tank in plain Spanish", () => {
    expect(rentalItemTypeLabel("concentrator")).toBe("Concentrador");
    expect(rentalItemTypeLabel("tank")).toBe("Tanque");
  });
});

describe("shouldRegisterDepositPayment (CU4)", () => {
  it("is true when a deposit was captured", () => {
    expect(shouldRegisterDepositPayment(1000)).toBe(true);
  });

  it("is false when there is no deposit", () => {
    expect(shouldRegisterDepositPayment(0)).toBe(false);
  });
});
