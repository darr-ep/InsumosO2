import { describe, expect, it } from "vitest";
import type { RentalItemRecord } from "@/data/rentals.repo";
import {
  availableStock,
  countActiveQuantityByType,
} from "@/domain/rentals/availability";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Concentradores disponibles"/"Tanques disponibles"
 * means REAL availability (total configured stock − currently active rentals
 * of that type). Pure rules, no I/O — `DashboardScreen` is the only place
 * these get wired to real data, mirroring `domain/rentals/dashboard.ts`'s
 * own docblock convention.
 *
 * Feature: Runtime-Editable Total Stock — `totalStockFromEnv`'s tests
 * (env-var parsing) are REMOVED along with the function itself; total stock
 * now comes from `src/data/settings.repo.ts#getBusinessSettings`, tested
 * there (mocked-boundary) and in `src/data/business-settings.integration.test.ts`
 * (live PocketBase). `availableStock`/`countActiveQuantityByType` below are
 * unaffected — same pure math, different caller.
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
