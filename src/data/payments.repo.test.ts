import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const create = vi.fn();
const update = vi.fn();
const del = vi.fn();
const collection = vi.fn(() => ({ getList, create, update, delete: del }));
const filter = vi.fn(
  (raw: string, params: Record<string, unknown>) =>
    `${raw}::${JSON.stringify(params)}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection, filter },
}));

const {
  createPayment,
  listPaymentsForRental,
  getLastRentPayment,
  updatePayment,
  deletePayment,
} = await import("@/data/payments.repo");

describe("createPayment (§7.2, §11.2)", () => {
  beforeEach(() => {
    create.mockReset();
    collection.mockClear();
  });

  it("creates a rent payment without a note", async () => {
    create.mockResolvedValueOnce({ id: "p1" });

    await createPayment({
      rentalId: "r1",
      amount: 2800,
      paymentType: "rent",
    });

    expect(collection).toHaveBeenCalledWith("payments");
    expect(create).toHaveBeenCalledWith(
      {
        rental_id: "r1",
        amount: 2800,
        payment_type: "rent",
      },
      { requestKey: null },
    );
  });

  it("includes the note when creating an adjustment payment", async () => {
    create.mockResolvedValueOnce({ id: "p2" });

    await createPayment({
      rentalId: "r1",
      amount: -200,
      paymentType: "adjustment",
      note: "se cobró de más por error",
    });

    expect(create).toHaveBeenCalledWith(
      {
        rental_id: "r1",
        amount: -200,
        payment_type: "adjustment",
        note: "se cobró de más por error",
      },
      { requestKey: null },
    );
  });

  it("never sends created_by (server-side, task 2.2)", async () => {
    create.mockResolvedValueOnce({ id: "p1" });

    await createPayment({ rentalId: "r1", amount: 100, paymentType: "rent" });

    expect(create.mock.calls[0][0]).not.toHaveProperty("created_by");
  });
});

describe("updatePayment", () => {
  beforeEach(() => {
    update.mockReset();
    collection.mockClear();
  });

  it("updates amount and note of an existing payment", async () => {
    update.mockResolvedValueOnce({ id: "p1", amount: 3500, note: "ajustado" });

    const result = await updatePayment("p1", {
      amount: 3500,
      note: "ajustado",
    });

    expect(collection).toHaveBeenCalledWith("payments");
    expect(update).toHaveBeenCalledWith(
      "p1",
      {
        amount: 3500,
        note: "ajustado",
      },
      { requestKey: null },
    );
    expect(result).toEqual({ id: "p1", amount: 3500, note: "ajustado" });
  });
});

describe("deletePayment", () => {
  beforeEach(() => {
    del.mockReset();
    collection.mockClear();
  });

  it("deletes a payment record by id", async () => {
    del.mockResolvedValueOnce(true);

    await deletePayment("p1");

    expect(collection).toHaveBeenCalledWith("payments");
    expect(del).toHaveBeenCalledWith("p1", { requestKey: null });
  });
});

describe("listPaymentsForRental (§7.2)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("filters by rental_id, sorted newest first", async () => {
    getList.mockResolvedValueOnce({
      items: [{ id: "p2" }, { id: "p1" }],
    });

    const result = await listPaymentsForRental("r1");

    expect(collection).toHaveBeenCalledWith("payments");
    expect(filter).toHaveBeenCalledWith("rental_id = {:rentalId}", {
      rentalId: "r1",
    });
    expect(getList).toHaveBeenCalledWith(
      1,
      50,
      expect.objectContaining({ sort: "-created" }),
    );
    expect(result).toEqual([{ id: "p2" }, { id: "p1" }]);
  });
});

describe("getLastRentPayment (§A.7)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
    filter.mockClear();
  });

  it("returns the most recent rent payment", async () => {
    getList.mockResolvedValueOnce({ items: [{ id: "p3", amount: 3000 }] });

    const result = await getLastRentPayment("r1");

    expect(filter).toHaveBeenCalledWith(
      "rental_id = {:rentalId} && payment_type = 'rent'",
      { rentalId: "r1" },
    );
    expect(result).toEqual({ id: "p3", amount: 3000 });
  });

  it("returns null when there is no rent payment yet", async () => {
    getList.mockResolvedValueOnce({ items: [] });

    const result = await getLastRentPayment("r1");

    expect(result).toBeNull();
  });
});
