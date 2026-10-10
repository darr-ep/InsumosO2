import { beforeEach, describe, expect, it, vi } from "vitest";

const getFirstListItem = vi.fn();
const update = vi.fn();
const collection = vi.fn(() => ({ getFirstListItem, update }));

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection },
}));

const { getBusinessSettings, updateBusinessSettings } = await import(
  "@/data/settings.repo"
);

/**
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced). Thin wrapper over the PocketBase SDK
 * for the `business_settings` singleton collection (see `pb_migrations/
 * *_business_settings_collection.js`'s docblock for the "exactly one row,
 * ever" story) — mocked-boundary unit tests, same style as
 * `customers.repo.test.ts`. Live API-Rules behavior (authenticated update
 * succeeds, unauthenticated is rejected) is proven separately by
 * `business-settings.integration.test.ts` against a real, isolated scratch
 * PocketBase instance.
 */

describe("getBusinessSettings", () => {
  beforeEach(() => {
    getFirstListItem.mockReset();
    collection.mockClear();
  });

  it("fetches the single business_settings row with no filter", async () => {
    getFirstListItem.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 5,
      total_tanques: 3,
    });

    const settings = await getBusinessSettings();

    expect(collection).toHaveBeenCalledWith("business_settings");
    expect(getFirstListItem).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ requestKey: null }),
    );
    expect(settings).toEqual({
      id: "s1",
      total_concentradores: 5,
      total_tanques: 3,
    });
  });
});

describe("updateBusinessSettings (business owner: editable 'tanto para aumentar como disminuir')", () => {
  beforeEach(() => {
    getFirstListItem.mockReset();
    update.mockReset();
    collection.mockClear();
  });

  it("increases total_concentradores by fetching the row's id first, then updating only that field", async () => {
    getFirstListItem.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 5,
      total_tanques: 3,
    });
    update.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 8,
      total_tanques: 3,
    });

    const result = await updateBusinessSettings({ totalConcentradores: 8 });

    expect(collection).toHaveBeenCalledWith("business_settings");
    expect(update).toHaveBeenCalledWith("s1", { total_concentradores: 8 });
    expect(result.total_concentradores).toBe(8);
  });

  it("decreases total_tanques via the same call path (increase and decrease are not separate code paths)", async () => {
    getFirstListItem.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 5,
      total_tanques: 3,
    });
    update.mockResolvedValueOnce({
      id: "s1",
      total_concentradores: 5,
      total_tanques: 1,
    });

    const result = await updateBusinessSettings({ totalTanques: 1 });

    expect(update).toHaveBeenCalledWith("s1", { total_tanques: 1 });
    expect(result.total_tanques).toBe(1);
  });
});
