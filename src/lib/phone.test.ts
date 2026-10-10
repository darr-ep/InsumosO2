import { describe, expect, it } from "vitest";
import { cleanPhoneDigits, formatPhoneDisplay, getCursorPositionAfterFormat } from "./phone";

describe("phone helpers", () => {
  it("formats 10 digits as XXX XXX XXXX for standard area codes, and XX XXXX XXXX for 55, 56, 33, 81", () => {
    expect(formatPhoneDisplay("7751234567")).toBe("775 123 4567");
    expect(formatPhoneDisplay("775 123 4567")).toBe("775 123 4567");
    expect(formatPhoneDisplay("7751234")).toBe("775 123 4");
    expect(formatPhoneDisplay("775")).toBe("775");

    // 55, 56, 33, 81
    expect(formatPhoneDisplay("5512345678")).toBe("55 1234 5678");
    expect(formatPhoneDisplay("5612345678")).toBe("56 1234 5678");
    expect(formatPhoneDisplay("3312345678")).toBe("33 1234 5678");
    expect(formatPhoneDisplay("8112345678")).toBe("81 1234 5678");
    expect(formatPhoneDisplay("551234")).toBe("55 1234");
    expect(formatPhoneDisplay("55")).toBe("55");
  });

  it("cleans and caps raw digits at 10", () => {
    expect(cleanPhoneDigits("775-123-4567-89")).toBe("7751234567");
    expect(cleanPhoneDigits("(775) 123 4567")).toBe("7751234567");
  });

  it("calculates correct cursor position after formatting", () => {
    // Deleting a digit in the middle of "55 1234 5678" -> user deletes '3' at position 6
    // e.target.value = "55 124 5678", selectionStart = 5
    expect(getCursorPositionAfterFormat("55 124 5678", 5, "55 1245 678")).toBe(5);

    // Typing a digit in the middle
    expect(getCursorPositionAfterFormat("55 12934 5678", 6, "55 1293 4567")).toBe(6);

    // Deleting at start
    expect(getCursorPositionAfterFormat("", 0, "")).toBe(0);

    // At end
    expect(getCursorPositionAfterFormat("5512345678", 10, "55 1234 5678")).toBe(12);
  });
});
