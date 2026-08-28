import { describe, expect, it } from "vitest";
import type { RentalItemRecord } from "@/data/rentals.repo";
import {
  DEFAULT_TOTAL_STOCK,
  availableStock,
  countActiveQuantityByType,
  totalStockFromEnv,
} from "@/domain/rentals/availability";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Concentradores disponibles"/"Tanques disponibles"
 * means REAL availability (total configured stock − currently active rentals
 * of that type). Total stock is two env vars (`VITE_TOTAL_CONCENTRADORES`/
 * `VITE_TOTAL_TANQUES`), same established pattern as `VITE_STALE_RENTAL_DAYS`
 * (Anexo A.3 precedent). Pure rules, no I/O — `DashboardScreen` (task below)
 * is the only place these get wired to real data, mirroring
 * `domain/rentals/dashboard.ts`'s own docblock convention.
 */

function item(
  overrides: Partial<RentalItemRecord> = {},
): RentalItemRecord {
  return {
    id: "ri1",
    collectionId: "c",
    collectionName: "rental_items",
    created: "",
    updated: "",
    rental_id: "r1",
    item_type: "concentrator",
    quantity: 1,
    ...overrides,
  } as RentalItemRecord;
}

describe("countActiveQuantityByType", () => {
  it("returns zero for both types when there are no items", () => {
    expect(countActiveQuantityByType([])).toEqual({
      concentrator: 0,
      tank: 0,
    });
  });

  it("sums quantity grouped by item_type across multiple rentals", () => {
    const items = [
      item({ id: "a", rental_id: "r1", item_type: "concentrator", quantity: 2 }),
      item({ id: "b", rental_id: "r2", item_type: "concentrator", quantity: 1 }),
      item({ id: "c", rental_id: "r2", item_type: "tank", quantity: 3 }),
    ];

    expect(countActiveQuantityByType(items)).toEqual({
      concentrator: 3,
      tank: 3,
    });
  });
});

describe("availableStock", () => {
  it("subtracts the active count from total stock", () => {
    expect(availableStock(10, 4)).toBe(6);
  });

  it("never goes negative when active count exceeds total stock", () => {
    expect(availableStock(2, 5)).toBe(0);
  });

  it("returns the full total when nothing is active", () => {
    expect(availableStock(10, 0)).toBe(10);
  });
});

describe("totalStockFromEnv (mirrors staleRentalDaysThreshold's defensive parsing, Anexo A.3 precedent)", () => {
  it("uses the configured value when it's a valid non-negative number", () => {
    expect(totalStockFromEnv("15")).toBe(15);
  });

  it("allows zero as an explicit, valid configured value", () => {
    expect(totalStockFromEnv("0")).toBe(0);
  });

  it("falls back to the default (0) when the env var is missing", () => {
    expect(totalStockFromEnv(undefined)).toBe(DEFAULT_TOTAL_STOCK);
  });

  it("falls back to the default (0) when the env var is not a valid number", () => {
    expect(totalStockFromEnv("not-a-number")).toBe(DEFAULT_TOTAL_STOCK);
  });

  it("falls back to the default (0) when the env var is negative", () => {
    expect(totalStockFromEnv("-5")).toBe(DEFAULT_TOTAL_STOCK);
  });
});
