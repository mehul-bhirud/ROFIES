import { describe, expect, it } from "vitest";
import { applyConditionMovement, resolveReturn } from "@/lib/domain/inventory";

describe("inventory arithmetic", () => {
  it("splits a pooled return across usable and repair condition", () => {
    expect(
      resolveReturn(4, [
        { condition: "perfect", quantity: 3 },
        { condition: "repair_required", quantity: 1 }
      ])
    ).toEqual({ returned: 4, usable: 3, repair: 1, notWorking: 0 });
  });

  it("rejects returns that exceed the unresolved obligation", () => {
    expect(() => resolveReturn(2, [{ condition: "perfect", quantity: 3 }])).toThrow(
      "Return exceeds unresolved quantity"
    );
  });

  it("never produces a negative condition balance", () => {
    expect(() =>
      applyConditionMovement(
        { perfect: 1, minor_damage: 0, repair_required: 0, not_working: 0 },
        "perfect",
        "repair_required",
        2
      )
    ).toThrow("Stock cannot become negative");
  });
});
