import { describe, expect, it } from "vitest";
import { cleanPhoneDigits, formatPhoneDisplay } from "./phone";

describe("phone helpers", () => {
  it("formats 10 digits as XXX XXX XXXX", () => {
    expect(formatPhoneDisplay("7751234567")).toBe("775 123 4567");
    expect(formatPhoneDisplay("775 123 4567")).toBe("775 123 4567");
    expect(formatPhoneDisplay("7751234")).toBe("775 123 4");
    expect(formatPhoneDisplay("775")).toBe("775");
  });

  it("cleans and caps raw digits at 10", () => {
    expect(cleanPhoneDigits("775-123-4567-89")).toBe("7751234567");
    expect(cleanPhoneDigits("(775) 123 4567")).toBe("7751234567");
  });
});
