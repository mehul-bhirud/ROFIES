import { describe, expect, it } from "vitest";
import { transitionLoan, transitionRequest, transitionReservation } from "@/lib/domain/lifecycle";

describe("lifecycle guards", () => {
  it("allows a reviewed request to become partially approved", () => {
    expect(transitionRequest("under_review", "partially_approved")).toBe("partially_approved");
  });

  it("rejects skipped request states", () => {
    expect(() => transitionRequest("draft", "approved")).toThrow("Invalid request transition");
  });

  it("does not issue a reservation before it is ready", () => {
    expect(() => transitionReservation("reserved", "issued")).toThrow(
      "Invalid reservation transition"
    );
  });

  it("keeps overdue derived instead of replacing loan state", () => {
    expect(transitionLoan("active", "overdue")).toEqual({ state: "active", overdue: true });
  });
});
