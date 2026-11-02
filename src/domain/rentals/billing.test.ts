import { describe, expect, it } from "vitest";
import {
  addMonthsAnchored,
  getLastDayOfMonth,
  getRentalNextDueDate,
  isRentalDue,
} from "./billing";

describe("domain/rentals/billing", () => {
  describe("getLastDayOfMonth", () => {
    it("returns 28 for February in non-leap year 2026", () => {
      expect(getLastDayOfMonth(2026, 1)).toBe(28); // Month 1 = February
    });

    it("returns 29 for February in leap year 2028", () => {
      expect(getLastDayOfMonth(2028, 1)).toBe(29);
    });

    it("returns 30 for April", () => {
      expect(getLastDayOfMonth(2026, 3)).toBe(30); // Month 3 = April
    });

    it("returns 31 for March and January", () => {
      expect(getLastDayOfMonth(2026, 0)).toBe(31);
      expect(getLastDayOfMonth(2026, 2)).toBe(31);
    });
  });

  describe("addMonthsAnchored", () => {
    it("anchors to the same day when months have enough days (1 Jan -> 1 Feb -> 1 Mar)", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
      const feb = addMonthsAnchored(start, 1);
      expect(feb.getUTCFullYear()).toBe(2026);
      expect(feb.getUTCMonth()).toBe(1);
      expect(feb.getUTCDate()).toBe(1);

      const mar = addMonthsAnchored(start, 2);
      expect(mar.getUTCFullYear()).toBe(2026);
      expect(mar.getUTCMonth()).toBe(2);
      expect(mar.getUTCDate()).toBe(1);
    });

    it("clamps to 28 for February when start date is 31 Jan", () => {
      const start = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
      const feb = addMonthsAnchored(start, 1);
      expect(feb.getUTCFullYear()).toBe(2026);
      expect(feb.getUTCMonth()).toBe(1);
      expect(feb.getUTCDate()).toBe(28);
    });

    it("clamps to 30 for April when start date is 31 March", () => {
      const start = new Date(Date.UTC(2026, 2, 31, 12, 0, 0));
      const apr = addMonthsAnchored(start, 1);
      expect(apr.getUTCFullYear()).toBe(2026);
      expect(apr.getUTCMonth()).toBe(3);
      expect(apr.getUTCDate()).toBe(30);
    });

    it("restores 31 for May even when April clamped to 30", () => {
      const start = new Date(Date.UTC(2026, 2, 31, 12, 0, 0));
      const may = addMonthsAnchored(start, 2);
      expect(may.getUTCFullYear()).toBe(2026);
      expect(may.getUTCMonth()).toBe(4);
      expect(may.getUTCDate()).toBe(31);
    });
  });

  describe("getRentalNextDueDate & isRentalDue", () => {
    it("gives 1 month dueDate initially (1 period covered by initial payment)", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const dueDate = getRentalNextDueDate(start, 1);
      expect(dueDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");

      // Before Feb 1 -> Not due
      expect(isRentalDue(start, 1, new Date(Date.UTC(2026, 0, 28)))).toBe(false);

      // On or after Feb 1 -> Due!
      expect(isRentalDue(start, 1, new Date(Date.UTC(2026, 1, 1)))).toBe(true);
      expect(isRentalDue(start, 1, new Date(Date.UTC(2026, 1, 2)))).toBe(true);
    });

    it("pushes dueDate to 1 March when 2 periods are covered (initial + 1 rent payment)", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      // Client paid on Jan 28, covering period until March 1
      const dueDate = getRentalNextDueDate(start, 2);
      expect(dueDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");

      // On Feb 2 -> NOT due anymore because it's covered until March 1
      expect(isRentalDue(start, 2, new Date(Date.UTC(2026, 1, 2)))).toBe(false);
      expect(isRentalDue(start, 2, new Date(Date.UTC(2026, 1, 28)))).toBe(false);

      // On March 1 -> Due!
      expect(isRentalDue(start, 2, new Date(Date.UTC(2026, 2, 1)))).toBe(true);
    });
  });
});
