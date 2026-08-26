import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const collection = vi.fn(() => ({ create }));

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection },
}));

const { createRental } = await import("@/data/rentals.repo");

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
