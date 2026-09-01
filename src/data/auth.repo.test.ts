import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const authWithPassword = vi.fn();
const collection = vi.fn(() => ({ authWithPassword }));
const clear = vi.fn();
const onChange = vi.fn();
const getURL = vi.fn(
  (record: { id: string }, filename: string) =>
    `https://pb.test/api/files/users/${record.id}/${filename}`,
);

vi.mock("@/data/pocketbaseClient", () => ({
  pb: {
    send,
    collection,
    files: { getURL },
    authStore: {
      get isValid() {
        return false;
      },
      clear,
      onChange,
    },
  },
}));

const {
  getLoginDirectory,
  loginDirectoryAvatarUrl,
  loginWithPassword,
  logout,
} = await import("@/data/auth.repo");

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

describe("loginDirectoryAvatarUrl (Redesign — UX/UI pass)", () => {
  beforeEach(() => {
    getURL.mockClear();
  });

  it("returns null when the entry has no avatar (never crashes/guesses a URL)", () => {
    expect(
      loginDirectoryAvatarUrl({
        id: "u1",
        name: "Juan Pérez",
        phone: "5512345678",
        avatar: "",
      }),
    ).toBeNull();
    expect(getURL).not.toHaveBeenCalled();
  });

  it("builds a file URL for the users collection when an avatar is set — no token (public, non-protected field)", () => {
    const url = loginDirectoryAvatarUrl({
      id: "u1",
      name: "Juan Pérez",
      phone: "5512345678",
      avatar: "photo123.png",
    });

    expect(getURL).toHaveBeenCalledWith(
      { id: "u1", collectionName: "users" },
      "photo123.png",
    );
    expect(url).toBe("https://pb.test/api/files/users/u1/photo123.png");
  });
});

describe("logout (§14 — logout manual disponible)", () => {
  it("clears the auth store", () => {
    logout();

    expect(clear).toHaveBeenCalled();
  });
});
