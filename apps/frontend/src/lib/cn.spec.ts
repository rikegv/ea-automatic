import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("ignora valores falsy e junta o resto", () => {
    expect(cn("a", false, undefined, "b", null, "c")).toBe("a b c");
  });
});
