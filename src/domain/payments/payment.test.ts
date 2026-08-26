import { describe, expect, it } from "vitest";
import {
  paymentFormSchema,
  suggestedPaymentAmount,
} from "@/domain/payments/payment";

describe("paymentFormSchema (§20, §7.2)", () => {
  it("accepts a well-formed rent payment", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rent payment with amount <= 0", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an adjustment without a note (CU5's last scenario)", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "adjustment",
      amount: -200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an adjustment with a blank note", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "adjustment",
      amount: -200,
      note: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an adjustment with a note and a negative amount (overcharge correction, CU5)", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "adjustment",
      amount: -200,
      note: "se cobró de más por error",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an adjustment with a note and a positive amount (undercharge correction, §11.2)", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "adjustment",
      amount: 200,
      note: "se cobró de menos por error",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an adjustment with amount 0", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "adjustment",
      amount: 0,
      note: "motivo",
    });
    expect(result.success).toBe(false);
  });
});

describe("suggestedPaymentAmount (Anexo A.7, CU5)", () => {
  it("uses the last rent payment when one exists", () => {
    expect(suggestedPaymentAmount(3000, 2800)).toBe(3000);
  });

  it("falls back to initial_rent_amount when there is no rent payment history", () => {
    expect(suggestedPaymentAmount(null, 2800)).toBe(2800);
  });
});
