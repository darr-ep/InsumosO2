import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    const includeB = false;
    expect(cn("a", includeB && "b", "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind classes to the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
