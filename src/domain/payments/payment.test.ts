import { describe, expect, it } from "vitest";
import {
  paymentFormSchema,
  paymentTypeLabel,
  suggestedPaymentAmount,
  totalPaid,
} from "@/domain/payments/payment";

describe("paymentFormSchema (§20, §7.2)", () => {
  it("accepts a well-formed rent payment", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a rent payment with an optional note", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: 3000,
      note: "Pago quincenal",
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

  it("rejects a rent payment with negative amount", () => {
    const result = paymentFormSchema.safeParse({
      payment_type: "rent",
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("defaults payment_type to rent if omitted", () => {
    const result = paymentFormSchema.safeParse({
      amount: 3000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_type).toBe("rent");
    }
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

describe("totalPaid (§16.10, task 3.3)", () => {
  it("sums deposit + rent + adjustment payments, adjustments can be negative", () => {
    expect(totalPaid([1000, 2800, -200])).toBe(3600);
  });

  it("returns 0 for no payments", () => {
    expect(totalPaid([])).toBe(0);
  });
});

describe("paymentTypeLabel (Redesign Round 3 — historial de pagos)", () => {
  it("labels rent as Pago", () => {
    expect(paymentTypeLabel("rent")).toBe("Pago");
  });

  it("labels deposit as Pago Inicial (disambiguated from ReturnDialog's 'Depósito a devolver')", () => {
    expect(paymentTypeLabel("deposit")).toBe("Pago Inicial");
  });

  it("labels adjustment as Ajuste", () => {
    expect(paymentTypeLabel("adjustment")).toBe("Ajuste");
  });
});
