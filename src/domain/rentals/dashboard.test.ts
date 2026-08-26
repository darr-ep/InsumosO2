import { describe, expect, it } from "vitest";
import {
  DEFAULT_STALE_RENTAL_DAYS,
  daysSince,
  isStaleRental,
  staleRentalDaysThreshold,
} from "@/domain/rentals/dashboard";

describe("daysSince", () => {
  it("computes whole days elapsed", () => {
    const startedAt = new Date("2026-08-01T00:00:00.000Z");
    const now = new Date("2026-08-26T00:00:00.000Z");
    expect(daysSince(startedAt, now)).toBe(25);
  });
});

describe("isStaleRental (§16.4, Anexo A.3, CU2)", () => {
  it("is false for a rental created 30 days ago exactly (threshold is exclusive)", () => {
    const startedAt = new Date("2026-07-27T00:00:00.000Z");
    const now = new Date("2026-08-26T00:00:00.000Z");
    expect(isStaleRental(startedAt, 30, now)).toBe(false);
  });

  it("is true for a rental older than the threshold (CU2's own scenario)", () => {
    const startedAt = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-08-26T00:00:00.000Z");
    expect(isStaleRental(startedAt, 30, now)).toBe(true);
  });

  it("is false for a brand-new rental", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    expect(isStaleRental(now, 30, now)).toBe(false);
  });
});

describe("staleRentalDaysThreshold (Anexo A.3)", () => {
  it("uses the configured value when it's a valid positive number", () => {
    expect(staleRentalDaysThreshold("45")).toBe(45);
  });

  it("falls back to the default when the env var is missing", () => {
    expect(staleRentalDaysThreshold(undefined)).toBe(DEFAULT_STALE_RENTAL_DAYS);
  });

  it("falls back to the default when the env var is not a valid number", () => {
    expect(staleRentalDaysThreshold("not-a-number")).toBe(
      DEFAULT_STALE_RENTAL_DAYS,
    );
  });

  it("falls back to the default when the env var is zero or negative", () => {
    expect(staleRentalDaysThreshold("0")).toBe(DEFAULT_STALE_RENTAL_DAYS);
    expect(staleRentalDaysThreshold("-5")).toBe(DEFAULT_STALE_RENTAL_DAYS);
  });
});
