import { describe, expect, it } from "vitest";
import { roomInputSchema } from "@/lib/validation";

describe("room input", () => {
  it("trims valid input and applies defaults", () => { expect(roomInputSchema.parse({ name: "  Studio  " })).toEqual({ name: "Studio", description: "", color: "violet" }); });
  it("rejects names that are too short", () => { expect(roomInputSchema.safeParse({ name: "x" }).success).toBe(false); });
});
