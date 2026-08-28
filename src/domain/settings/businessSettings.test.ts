import { describe, expect, it } from "vitest";
import { totalStockSchema } from "@/domain/settings/businessSettings";

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced). Pure validation for the tap-to-edit
 * dialog on `DashboardStats.tsx`'s two availability tiles. Business owner
 * (verbatim): the total needs to be editable "tanto para aumentar como
 * disminuir" — but "un negocio no puede tener -3 concentradores", so a
 * negative total is rejected client-side with a clear Spanish message. Same
 * `zod` + `.safeParse()` convention `domain/payments/payment.ts`'s
 * `paymentFormSchema` already established for this project's dialogs.
 */

describe("totalStockSchema", () => {
  it("accepts a valid non-negative integer", () => {
    const result = totalStockSchema.safeParse(12);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(12);
    }
  });

  it("accepts zero as an explicit, valid total", () => {
    const result = totalStockSchema.safeParse(0);

    expect(result.success).toBe(true);
  });

  it("rejects a negative total with a clear Spanish message (business owner: a business can't have -3 concentradores)", () => {
    const result = totalStockSchema.safeParse(-3);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "El total no puede ser negativo.",
      );
    }
  });

  it("rejects a non-integer total with a clear Spanish message", () => {
    const result = totalStockSchema.safeParse(2.5);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "El total debe ser un número entero.",
      );
    }
  });

  it("rejects a non-numeric input (e.g. NaN from an unparsable field) with a clear Spanish message", () => {
    const result = totalStockSchema.safeParse(Number("abc"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Ingresa un número válido.");
    }
  });
});
