import { describe, expect, it } from "vitest";
import { calculateAvailability, overlaps } from "@/lib/domain/availability";

const d = (value: string) => new Date(value);

describe("availability", () => {
  it("treats touching intervals as non-overlapping half-open ranges", () => {
    expect(
      overlaps(
        d("2026-08-10T10:00:00Z"),
        d("2026-08-10T11:00:00Z"),
        d("2026-08-10T11:00:00Z"),
        d("2026-08-10T12:00:00Z")
      )
    ).toBe(false);
  });

  it("subtracts approved reservations but ignores pending requests", () => {
    const result = calculateAvailability({
      usableQuantity: 8,
      requested: { start: d("2026-08-10T00:00:00Z"), end: d("2026-08-12T00:00:00Z") },
      allocations: [
        {
          quantity: 3,
          start: d("2026-08-10T00:00:00Z"),
          end: d("2026-08-11T00:00:00Z"),
          state: "reserved"
        },
        {
          quantity: 7,
          start: d("2026-08-10T00:00:00Z"),
          end: d("2026-08-12T00:00:00Z"),
          state: "pending"
        },
        {
          quantity: 4,
          start: d("2026-08-11T00:00:00Z"),
          end: d("2026-08-13T00:00:00Z"),
          state: "reserved"
        }
      ]
    });
    expect(result.availableQuantity).toBe(4);
    expect(result.canFulfill(4)).toBe(true);
    expect(result.canFulfill(5)).toBe(false);
  });

  it("rejects invalid date ranges", () => {
    expect(() =>
      calculateAvailability({
        usableQuantity: 1,
        requested: { start: d("2026-08-12T00:00:00Z"), end: d("2026-08-10T00:00:00Z") },
        allocations: []
      })
    ).toThrow("End must be after start");
  });
});
