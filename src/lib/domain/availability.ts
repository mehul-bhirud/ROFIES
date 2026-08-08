export type AllocationState = "pending" | "reserved" | "ready_for_pickup" | "issued";

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface Allocation extends TimeRange {
  quantity: number;
  state: AllocationState;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function calculateAvailability(input: {
  usableQuantity: number;
  requested: TimeRange;
  allocations: readonly Allocation[];
}) {
  const { requested, usableQuantity } = input;
  if (!(requested.end > requested.start)) throw new Error("End must be after start");
  if (!Number.isInteger(usableQuantity) || usableQuantity < 0) {
    throw new Error("Usable quantity must be a non-negative integer");
  }

  const blocking = input.allocations.filter(
    (allocation) =>
      allocation.state !== "pending" &&
      overlaps(requested.start, requested.end, allocation.start, allocation.end)
  );
  const boundaries = [
    requested.start,
    ...blocking
      .flatMap((allocation) => [allocation.start, allocation.end])
      .filter((boundary) => boundary >= requested.start && boundary < requested.end)
  ];

  let peakAllocation = 0;
  for (const boundary of boundaries) {
    const allocated = blocking.reduce(
      (total, allocation) =>
        allocation.start <= boundary && boundary < allocation.end
          ? total + allocation.quantity
          : total,
      0
    );
    peakAllocation = Math.max(peakAllocation, allocated);
  }

  const availableQuantity = Math.max(0, usableQuantity - peakAllocation);
  return {
    availableQuantity,
    canFulfill: (quantity: number) =>
      Number.isInteger(quantity) && quantity > 0 && quantity <= availableQuantity
  };
}
