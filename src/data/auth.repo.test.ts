import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const authWithPassword = vi.fn();
const collection = vi.fn(() => ({ authWithPassword }));
const clear = vi.fn();
const onChange = vi.fn();

vi.mock("@/data/pocketbaseClient", () => ({
  pb: {
    send,
    collection,
    authStore: {
      get isValid() {
        return false;
      },
      clear,
      onChange,
    },
  },
}));

const { getLoginDirectory, loginWithPassword, logout } = await import(
  "@/data/auth.repo"
);

describe("getLoginDirectory (§14, §16.6, gap-fill)", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("fetches the public login directory via GET /api/login-directory", async () => {
    send.mockResolvedValueOnce([
      { id: "u1", name: "Juan Pérez", phone: "5512345678" },
    ]);

    const result = await getLoginDirectory();

    expect(send).toHaveBeenCalledWith("/api/login-directory", {
      method: "GET",
      requestKey: null,
    });
    expect(result).toEqual([
      { id: "u1", name: "Juan Pérez", phone: "5512345678" },
    ]);
  });
});

describe("loginWithPassword (§14)", () => {
  beforeEach(() => {
    collection.mockClear();
    authWithPassword.mockReset();
  });

  it("calls pb.collection('users').authWithPassword(phone, password)", async () => {
    authWithPassword.mockResolvedValueOnce({ record: { id: "u1" } });

    await loginWithPassword("5512345678", "s3cret");

    expect(collection).toHaveBeenCalledWith("users");
    expect(authWithPassword).toHaveBeenCalledWith("5512345678", "s3cret");
  });
});

describe("logout (§14 — logout manual disponible)", () => {
  it("clears the auth store", () => {
    logout();

    expect(clear).toHaveBeenCalled();
  });
});
