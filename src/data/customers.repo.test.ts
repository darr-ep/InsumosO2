import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const create = vi.fn();
const collection = vi.fn(() => ({ getList, create }));
const filter = vi.fn(
  (raw: string, params: Record<string, unknown>) =>
    `${raw}::${JSON.stringify(params)}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection, filter },
}));

const { searchCustomers, createCustomer } = await import(
  "@/data/customers.repo"
);

describe("searchCustomers (§7.1 buscar/crear cliente)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("returns an empty array without querying PocketBase for a blank query", async () => {
    const result = await searchCustomers("   ");

    expect(result).toEqual([]);
    expect(collection).not.toHaveBeenCalled();
  });

  it("filters by name or phone and returns the items page", async () => {
    getList.mockResolvedValueOnce({
      items: [{ id: "c1", name: "Juan Pérez", phone: "5512345678" }],
    });

    const result = await searchCustomers("Juan");

    expect(collection).toHaveBeenCalledWith("customers");
    expect(filter).toHaveBeenCalledWith("name ~ {:q} || phone ~ {:q}", {
      q: "Juan",
    });
    expect(result).toEqual([
      { id: "c1", name: "Juan Pérez", phone: "5512345678" },
    ]);
  });
});

describe("createCustomer (§7.1, §15)", () => {
  beforeEach(() => {
    create.mockReset();
    collection.mockClear();
  });

  it("submits name, phone and credential_photo as multipart form data", async () => {
    create.mockResolvedValueOnce({ id: "c1" });
    const photo = new File(["fake"], "credencial.png", {
      type: "image/png",
    });

    await createCustomer({
      name: "Juan Pérez",
      phone: "5512345678",
      credentialPhoto: photo,
    });

    expect(collection).toHaveBeenCalledWith("customers");
    const sentFormData = create.mock.calls[0][0] as FormData;
    expect(sentFormData).toBeInstanceOf(FormData);
    expect(sentFormData.get("name")).toBe("Juan Pérez");
    expect(sentFormData.get("phone")).toBe("5512345678");
    expect(sentFormData.get("credential_photo")).toBe(photo);
  });
});
