import { describe, expect, it } from "vitest";
import {
  passwordChangeFormSchema,
  profileFormSchema,
} from "@/domain/auth/profile";

describe("profileFormSchema (New gap-fill feature: Self-Service Profile Screen)", () => {
  it("accepts a valid name/phone pair", () => {
    const result = profileFormSchema.safeParse({
      name: "Juan Pérez",
      phone: "5512345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = profileFormSchema.safeParse({ name: "J", phone: "5512345678" });
    expect(result.success).toBe(false);
  });

  it("rejects a phone that isn't exactly 10 digits", () => {
    const result = profileFormSchema.safeParse({
      name: "Juan Pérez",
      phone: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace on both fields", () => {
    const result = profileFormSchema.safeParse({
      name: "  Juan Pérez  ",
      phone: "  5512345678  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Juan Pérez");
      expect(result.data.phone).toBe("5512345678");
    }
  });
});

describe("passwordChangeFormSchema (live-verified min length, auth-profile.integration.test.ts)", () => {
  it("accepts a valid password change", () => {
    const result = passwordChangeFormSchema.safeParse({
      oldPassword: "current-pass",
      password: "newpass123",
      passwordConfirm: "newpass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty current password", () => {
    const result = passwordChangeFormSchema.safeParse({
      oldPassword: "",
      password: "newpass123",
      passwordConfirm: "newpass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a new password shorter than 8 characters (live-verified PocketBase floor)", () => {
    const result = passwordChangeFormSchema.safeParse({
      oldPassword: "current-pass",
      password: "short1",
      passwordConfirm: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when password and passwordConfirm don't match, flagging passwordConfirm", () => {
    const result = passwordChangeFormSchema.safeParse({
      oldPassword: "current-pass",
      password: "newpass123",
      passwordConfirm: "different123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["passwordConfirm"]);
    }
  });
});
