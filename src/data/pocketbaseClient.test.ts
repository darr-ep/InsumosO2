import { describe, expect, it } from "vitest";
import PocketBase from "pocketbase";
import { pb } from "@/data/pocketbaseClient";

describe("pocketbaseClient", () => {
  it("exports a single shared PocketBase instance with a persistent authStore (§14)", () => {
    expect(pb).toBeInstanceOf(PocketBase);
    expect(pb.authStore).toBeDefined();
  });
});
