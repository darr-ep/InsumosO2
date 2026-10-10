import { describe, expect, it } from "vitest";
import {
  customerFormSchema,
  formatCustomerName,
  isAcceptedCredentialPhotoType,
  isCredentialPending,
  isCredentialPhotoWithinSizeLimit,
} from "@/domain/customers/customer";

describe("formatCustomerName", () => {
  it("formats all-lowercase name to Title Case", () => {
    expect(formatCustomerName("juan pérez")).toBe("Juan Pérez");
  });

  it("formats all-caps name to Title Case", () => {
    expect(formatCustomerName("JUAN PÉREZ")).toBe("Juan Pérez");
  });

  it("formats mixed case name to Title Case", () => {
    expect(formatCustomerName("jUaN pÉrEz")).toBe("Juan Pérez");
  });

  it("handles multiple spaces between words and trims edges", () => {
    expect(formatCustomerName("   juan    carlos   pérez   gómez   ")).toBe(
      "Juan Carlos Pérez Gómez",
    );
  });

  it("formats names with accented characters correctly in Spanish", () => {
    expect(formatCustomerName("ÁNGEL PÉREZ")).toBe("Ángel Pérez");
    expect(formatCustomerName("óscar ñúñez")).toBe("Óscar Ñúñez");
    expect(formatCustomerName("ÍTALO ÉDGAR")).toBe("Ítalo Édgar");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(formatCustomerName("")).toBe("");
    expect(formatCustomerName("   ")).toBe("");
  });
});

describe("customerFormSchema (§20)", () => {
  it("accepts a valid name and 10-digit phone and transforms name to Title Case", () => {
    const result = customerFormSchema.safeParse({
      name: "JUAN PÉREZ",
      phone: "5512345678",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Juan Pérez");
    }
  });

  it("accepts an empty phone number when creating or editing a customer", () => {
    const result = customerFormSchema.safeParse({
      name: "Juan Pérez",
      phone: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = customerFormSchema.safeParse({
      name: "J",
      phone: "5512345678",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a phone that isn't exactly 10 digits", () => {
    expect(
      customerFormSchema.safeParse({ name: "Juan", phone: "12345" }).success,
    ).toBe(false);
    expect(
      customerFormSchema.safeParse({ name: "Juan", phone: "55123456789" })
        .success,
    ).toBe(false);
    expect(
      customerFormSchema.safeParse({ name: "Juan", phone: "551234567a" })
        .success,
    ).toBe(false);
  });
});

describe("isAcceptedCredentialPhotoType (§20)", () => {
  it("accepts jpeg, png and webp", () => {
    expect(isAcceptedCredentialPhotoType("image/jpeg")).toBe(true);
    expect(isAcceptedCredentialPhotoType("image/png")).toBe(true);
    expect(isAcceptedCredentialPhotoType("image/webp")).toBe(true);
  });

  it("rejects any other mime type", () => {
    expect(isAcceptedCredentialPhotoType("application/pdf")).toBe(false);
    expect(isAcceptedCredentialPhotoType("image/gif")).toBe(false);
  });
});

describe("isCredentialPhotoWithinSizeLimit (§20 — max 8MB)", () => {
  it("accepts files at or under 8MB", () => {
    expect(isCredentialPhotoWithinSizeLimit(1024)).toBe(true);
    expect(isCredentialPhotoWithinSizeLimit(8 * 1024 * 1024)).toBe(true);
  });

  it("rejects files over 8MB or empty files", () => {
    expect(isCredentialPhotoWithinSizeLimit(8 * 1024 * 1024 + 1)).toBe(false);
    expect(isCredentialPhotoWithinSizeLimit(0)).toBe(false);
  });
});

describe("isCredentialPending (§21/Anexo A.5 — 'credencial pendiente', task 3.4)", () => {
  it("is pending when credential_photo is empty, null or undefined", () => {
    expect(isCredentialPending("")).toBe(true);
    expect(isCredentialPending(null)).toBe(true);
    expect(isCredentialPending(undefined)).toBe(true);
  });

  it("is not pending once a credential_photo filename exists", () => {
    expect(isCredentialPending("credencial_abc123.png")).toBe(false);
  });
});
