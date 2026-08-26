import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const getList = vi.fn();
const collection = vi.fn(() => ({ create, getList }));
const filter = vi.fn(
  (raw: string, params: Record<string, unknown>) =>
    `${raw}::${JSON.stringify(params)}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection, filter },
}));

const { createRental, listActiveRentals, searchRentals } = await import(
  "@/data/rentals.repo"
);

describe("createRental (CU4 orchestration)", () => {
  beforeEach(() => {
    create.mockReset();
    collection.mockClear();
  });

  it("creates the rental, then one rental_item per product, then a deposit payment when deposit > 0", async () => {
    create
      .mockResolvedValueOnce({ id: "rental1", folio: "R-000001" })
      .mockResolvedValueOnce({ id: "item1" })
      .mockResolvedValueOnce({ id: "payment1" });

    const result = await createRental({
      customerId: "cust1",
      items: [{ itemType: "concentrator", quantity: 1 }],
      initialRentAmount: 2800,
      depositAmount: 1000,
      extras: [],
    });

    expect(collection).toHaveBeenNthCalledWith(1, "rentals");
    expect(create).toHaveBeenNthCalledWith(1, {
      customer_id: "cust1",
      initial_rent_amount: 2800,
      deposit_amount: 1000,
      extras: [],
    });

    expect(collection).toHaveBeenNthCalledWith(2, "rental_items");
    expect(create).toHaveBeenNthCalledWith(2, {
      rental_id: "rental1",
      item_type: "concentrator",
      quantity: 1,
    });

    expect(collection).toHaveBeenNthCalledWith(3, "payments");
    expect(create).toHaveBeenNthCalledWith(3, {
      rental_id: "rental1",
      amount: 1000,
      payment_type: "deposit",
    });

    expect(result.depositPayment).toEqual({ id: "payment1" });
  });

  it("never sends folio or status when creating the rental", async () => {
    create.mockResolvedValueOnce({ id: "rental1", folio: "R-000002" });

    await createRental({
      customerId: "cust1",
      items: [],
      initialRentAmount: 500,
      depositAmount: 0,
      extras: [],
    });

    const rentalPayload = create.mock.calls[0][0];
    expect(rentalPayload).not.toHaveProperty("folio");
    expect(rentalPayload).not.toHaveProperty("status");
  });

  it("does not create a payment when there is no deposit", async () => {
    create.mockResolvedValueOnce({ id: "rental2", folio: "R-000003" });

    const result = await createRental({
      customerId: "cust1",
      items: [],
      initialRentAmount: 500,
      depositAmount: 0,
      extras: [],
    });

    expect(collection).not.toHaveBeenCalledWith("payments");
    expect(result.depositPayment).toBeNull();
  });
});

describe("listActiveRentals (§16.6, CU2)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
  });

  it("filters by status=ACTIVE, sorted newest first, expanding the customer", async () => {
    getList.mockResolvedValueOnce({ items: [{ id: "r1" }, { id: "r2" }] });

    const result = await listActiveRentals();

    expect(collection).toHaveBeenCalledWith("rentals");
    expect(getList).toHaveBeenCalledWith(
      1,
      200,
      expect.objectContaining({ sort: "-created", expand: "customer_id" }),
    );
    expect(result).toEqual([{ id: "r1" }, { id: "r2" }]);
  });
});

describe("searchRentals (§7.4, §16.9, CU3)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("returns an empty array without querying PocketBase for a blank query", async () => {
    const result = await searchRentals("   ");

    expect(result).toEqual([]);
    expect(collection).not.toHaveBeenCalled();
  });

  it("matches folio/customer name/customer phone in one filter, expanding the customer", async () => {
    getList.mockResolvedValueOnce({ items: [{ id: "r1", folio: "R-000184" }] });

    const result = await searchRentals("184");

    expect(collection).toHaveBeenCalledWith("rentals");
    expect(filter).toHaveBeenCalledWith(
      "folio ~ {:q} || customer_id.name ~ {:q} || customer_id.phone ~ {:q}",
      { q: "184" },
    );
    expect(getList).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ expand: "customer_id" }),
    );
    expect(result).toEqual([{ id: "r1", folio: "R-000184" }]);
  });
});
