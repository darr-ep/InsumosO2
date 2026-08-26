import { describe, expect, it } from "vitest";
import {
  customerFormSchema,
  isAcceptedCredentialPhotoType,
  isCredentialPending,
  isCredentialPhotoWithinSizeLimit,
} from "@/domain/customers/customer";

describe("customerFormSchema (§20)", () => {
  it("accepts a valid name and 10-digit phone", () => {
    const result = customerFormSchema.safeParse({
      name: "Juan Pérez",
      phone: "5512345678",
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
