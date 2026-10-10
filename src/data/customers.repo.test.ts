import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const create = vi.fn();
const update = vi.fn();
const getOne = vi.fn();
const getToken = vi.fn();
const getURL = vi.fn();
const collection = vi.fn(() => ({ getList, create, update, getOne }));
const filter = vi.fn(
  (raw: string, params: Record<string, unknown>) =>
    `${raw}::${JSON.stringify(params)}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: { collection, filter, files: { getToken, getURL } },
}));

const {
  searchCustomers,
  createCustomer,
  updateCustomerCredentialPhoto,
  getCustomer,
  getCredentialPhotoUrl,
  listCustomers,
} = await import("@/data/customers.repo");

describe("listCustomers (Redesign Round 2, Batch 2 — Clientes screen)", () => {
  beforeEach(() => {
    getList.mockReset();
    collection.mockClear();
  });

  it("lists every customer, sorted by name, with no filter", async () => {
    getList.mockResolvedValueOnce({
      items: [
        { id: "c1", name: "Ana", phone: "5511111111" },
        { id: "c2", name: "Beto", phone: "5522222222" },
      ],
    });

    const result = await listCustomers();

    expect(collection).toHaveBeenCalledWith("customers");
    expect(getList).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.objectContaining({
        sort: "name",
      }),
    );
    expect(result).toEqual([
      { id: "c1", name: "Ana", phone: "5511111111" },
      { id: "c2", name: "Beto", phone: "5522222222" },
    ]);
  });
});

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

  // Phase 3 fix (§21/Anexo A.5): credential_photo is optional at the schema
  // level now — proves the repo doesn't send an empty/undefined file part
  // when the caller has no photo (CustomerForm submitting with `null`).
  it("creates a customer without credential_photo when none is provided ('credencial pendiente')", async () => {
    create.mockResolvedValueOnce({ id: "c1", credential_photo: "" });

    const customer = await createCustomer({
      name: "Juan Pérez",
      phone: "5512345678",
      credentialPhoto: null,
    });

    expect(collection).toHaveBeenCalledWith("customers");
    const sentFormData = create.mock.calls[0][0] as FormData;
    expect(sentFormData.get("name")).toBe("Juan Pérez");
    expect(sentFormData.has("credential_photo")).toBe(false);
    expect(customer.credential_photo).toBe("");
  });
});

describe("updateCustomerCredentialPhoto (§16.13, task 3.4 — retry upload later)", () => {
  beforeEach(() => {
    update.mockReset();
    collection.mockClear();
  });

  it("sends the new file as multipart form data to the existing customer", async () => {
    update.mockResolvedValueOnce({ id: "c1", credential_photo: "new.png" });
    const photo = new File(["fake"], "credencial.png", {
      type: "image/png",
    });

    const customer = await updateCustomerCredentialPhoto("c1", photo);

    expect(collection).toHaveBeenCalledWith("customers");
    const [id, sentFormData] = update.mock.calls[0] as [string, FormData];
    expect(id).toBe("c1");
    expect(sentFormData.get("credential_photo")).toBe(photo);
    expect(customer.credential_photo).toBe("new.png");
  });
});

describe("getCustomer (§16.6, CU7 — ficha de cliente)", () => {
  beforeEach(() => {
    getOne.mockReset();
    collection.mockClear();
  });

  it("fetches a single customer by id", async () => {
    getOne.mockResolvedValueOnce({ id: "c1", name: "Juan Pérez" });

    const customer = await getCustomer("c1");

    expect(collection).toHaveBeenCalledWith("customers");
    expect(getOne).toHaveBeenCalledWith("c1", { requestKey: null });
    expect(customer).toEqual({ id: "c1", name: "Juan Pérez" });
  });
});

describe("getCredentialPhotoUrl (§15, CU7 — ver credencial bajo demanda)", () => {
  beforeEach(() => {
    getToken.mockReset();
    getURL.mockReset();
  });

  it("requests a file token first, then builds the URL with it (never a bare/permanent URL)", async () => {
    getToken.mockResolvedValueOnce("short-lived-token");
    getURL.mockReturnValueOnce(
      "http://pb.local/api/files/customers/c1/credencial.png?token=short-lived-token",
    );

    const customer = {
      id: "c1",
      collectionId: "customers",
      collectionName: "customers",
      name: "Juan Pérez",
      phone: "5512345678",
      credential_photo: "credencial.png",
    };

    const url = await getCredentialPhotoUrl(customer);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getURL).toHaveBeenCalledWith(customer, "credencial.png", {
      token: "short-lived-token",
    });
    expect(url).toBe(
      "http://pb.local/api/files/customers/c1/credencial.png?token=short-lived-token",
    );
  });
});
