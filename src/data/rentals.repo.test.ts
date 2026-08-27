import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
const collection = vi.fn(() => ({ create, getList, getOne }));
const filter = vi.fn(
  (raw: string, params: Record<string, unknown>) =>
    `${raw}::${JSON.stringify(params)}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection, filter, send },
}));

const {
  createRental,
  getRental,
  listActiveRentals,
  listItemsForRental,
  listRentalsForCustomer,
  listReturnedRentals,
  returnRental,
  searchRentals,
  RentalPartiallyCreatedError,
} = await import("@/data/rentals.repo");

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
    expect(create).toHaveBeenNthCalledWith(
      2,
      {
        rental_id: "rental1",
        item_type: "concentrator",
        quantity: 1,
      },
      { requestKey: null },
    );

    expect(collection).toHaveBeenNthCalledWith(3, "payments");
    expect(create).toHaveBeenNthCalledWith(3, {
      rental_id: "rental1",
      amount: 1000,
      payment_type: "deposit",
    });

    expect(result.depositPayment).toEqual({ id: "payment1" });
  });

  it("gap-fill (deposit payment race): passes a distinct requestKey: null on EVERY concurrent rental_item create, so the PocketBase SDK's default auto-cancellation (which shares one requestKey per method+URL) never aborts a sibling create firing from the same Promise.all — real root cause confirmed live via _logs (zero payments POST ever attempted) and reproduced against a scratch PocketBase instance (ClientResponseError 'The request was aborted (most likely autocancelled)')", async () => {
    create
      .mockResolvedValueOnce({ id: "rental1", folio: "R-000001" })
      .mockResolvedValueOnce({ id: "item1" })
      .mockResolvedValueOnce({ id: "item2" })
      .mockResolvedValueOnce({ id: "payment1" });

    await createRental({
      customerId: "cust1",
      items: [
        { itemType: "concentrator", quantity: 1 },
        { itemType: "tank", quantity: 1 },
      ],
      initialRentAmount: 2800,
      depositAmount: 12000,
      extras: [],
    });

    const itemCreateCalls = create.mock.calls.slice(1, 3);
    for (const call of itemCreateCalls) {
      expect(call[1]).toEqual({ requestKey: null });
    }
  });

  it("gap-fill (deposit payment race): wraps a rental_items/payment failure in RentalPartiallyCreatedError carrying the already-saved rental — never re-throws the raw error, so a caller can tell the rental record itself was NOT lost", async () => {
    const rejection = new Error("aborted");
    create
      .mockResolvedValueOnce({ id: "rental1", folio: "R-000001" })
      .mockRejectedValueOnce(rejection);

    const error: unknown = await createRental({
      customerId: "cust1",
      items: [
        { itemType: "concentrator", quantity: 1 },
        { itemType: "tank", quantity: 1 },
      ],
      initialRentAmount: 2800,
      depositAmount: 12000,
      extras: [],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RentalPartiallyCreatedError);
    const partial = error as InstanceType<typeof RentalPartiallyCreatedError>;
    expect(partial.rental).toEqual({ id: "rental1", folio: "R-000001" });
    expect(partial.itemsCreated).toEqual([]);
    expect(partial.cause).toBe(rejection);
  });

  it("gap-fill (deposit payment race): wraps a deposit-payment-only failure in RentalPartiallyCreatedError, carrying the items that DID get created", async () => {
    const rejection = new Error("payment rejected");
    create
      .mockResolvedValueOnce({ id: "rental1", folio: "R-000001" })
      .mockResolvedValueOnce({ id: "item1" })
      .mockRejectedValueOnce(rejection);

    const error: unknown = await createRental({
      customerId: "cust1",
      items: [{ itemType: "concentrator", quantity: 1 }],
      initialRentAmount: 2800,
      depositAmount: 12000,
      extras: [],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RentalPartiallyCreatedError);
    const partial = error as InstanceType<typeof RentalPartiallyCreatedError>;
    expect(partial.rental).toEqual({ id: "rental1", folio: "R-000001" });
    expect(partial.itemsCreated).toEqual([{ id: "item1" }]);
    expect(partial.cause).toBe(rejection);
  });

  it("gap-fill (deposit payment race): does NOT wrap a failure creating the rental record itself — nothing was saved yet, so the raw error passes through unchanged", async () => {
    const rejection = new Error("network down");
    create.mockRejectedValueOnce(rejection);

    await expect(
      createRental({
        customerId: "cust1",
        items: [{ itemType: "concentrator", quantity: 1 }],
        initialRentAmount: 2800,
        depositAmount: 1000,
        extras: [],
      }),
    ).rejects.toBe(rejection);
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

describe("listReturnedRentals (Historial screen, redesign — new route, same rentals collection)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("filters by status=RETURNED, sorted newest first, expanding the customer", async () => {
    getList.mockResolvedValueOnce({ items: [{ id: "r1" }, { id: "r2" }] });

    const result = await listReturnedRentals();

    expect(collection).toHaveBeenCalledWith("rentals");
    expect(filter).toHaveBeenCalledWith("status = {:status}", {
      status: "RETURNED",
    });
    expect(getList).toHaveBeenCalledWith(
      1,
      200,
      expect.objectContaining({ sort: "-created", expand: "customer_id" }),
    );
    expect(result).toEqual([{ id: "r1" }, { id: "r2" }]);
  });
});

describe("getRental (§16.10, CU6/CU7, task 3.3)", () => {
  beforeEach(() => {
    getOne.mockReset();
    collection.mockClear();
  });

  it("fetches a single rental by id, expanding the customer", async () => {
    getOne.mockResolvedValueOnce({ id: "r1", status: "ACTIVE" });

    const result = await getRental("r1");

    expect(collection).toHaveBeenCalledWith("rentals");
    expect(getOne).toHaveBeenCalledWith("r1", { expand: "customer_id" });
    expect(result).toEqual({ id: "r1", status: "ACTIVE" });
  });
});

describe("listItemsForRental (§16.10, task 3.3)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("filters rental_items by rental_id", async () => {
    getList.mockResolvedValueOnce({
      items: [{ id: "i1", item_type: "concentrator", quantity: 2 }],
    });

    const result = await listItemsForRental("r1");

    expect(collection).toHaveBeenCalledWith("rental_items");
    expect(filter).toHaveBeenCalledWith("rental_id = {:rentalId}", {
      rentalId: "r1",
    });
    expect(result).toEqual([
      { id: "i1", item_type: "concentrator", quantity: 2 },
    ]);
  });
});

describe("returnRental (§19.1, §7.3, CU6, task 3.1)", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("POSTs to the custom return endpoint with amount_collected/deposit_returned, never a direct collection update", async () => {
    send.mockResolvedValueOnce({ id: "rental1", status: "RETURNED" });

    const result = await returnRental({
      rentalId: "rental1",
      amountCollected: 2800,
      depositReturned: 1000,
    });

    expect(send).toHaveBeenCalledWith("/api/rentals/rental1/return", {
      method: "POST",
      body: { amount_collected: 2800, deposit_returned: 1000 },
    });
    expect(result).toEqual({ id: "rental1", status: "RETURNED" });
  });

  it("includes an optional note when provided", async () => {
    send.mockResolvedValueOnce({ id: "rental1", status: "RETURNED" });

    await returnRental({
      rentalId: "rental1",
      amountCollected: 0,
      depositReturned: 500,
      note: "acuerdo especial",
    });

    expect(send).toHaveBeenCalledWith("/api/rentals/rental1/return", {
      method: "POST",
      body: {
        amount_collected: 0,
        deposit_returned: 500,
        note: "acuerdo especial",
      },
    });
  });
});

describe("listRentalsForCustomer (§16.6, CU7, task 3.4)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("filters by customer_id, sorted newest first, across all statuses", async () => {
    getList.mockResolvedValueOnce({
      items: [{ id: "r1", status: "RETURNED" }, { id: "r2", status: "ACTIVE" }],
    });

    const result = await listRentalsForCustomer("cust1");

    expect(collection).toHaveBeenCalledWith("rentals");
    expect(filter).toHaveBeenCalledWith("customer_id = {:customerId}", {
      customerId: "cust1",
    });
    expect(getList).toHaveBeenCalledWith(
      1,
      200,
      expect.objectContaining({ sort: "-created" }),
    );
    expect(result).toEqual([
      { id: "r1", status: "RETURNED" },
      { id: "r2", status: "ACTIVE" },
    ]);
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
