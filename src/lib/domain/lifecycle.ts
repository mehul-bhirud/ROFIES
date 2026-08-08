export type RequestState =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "changes_requested"
  | "cancelled";
export type ReservationState = "reserved" | "ready_for_pickup" | "issued" | "expired" | "cancelled";
export type LoanState = "active" | "partially_returned" | "returned";

const requestTransitions: Record<RequestState, readonly RequestState[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "partially_approved", "rejected", "changes_requested", "cancelled"],
  approved: [],
  partially_approved: [],
  rejected: [],
  changes_requested: ["draft", "cancelled"],
  cancelled: []
};

const reservationTransitions: Record<ReservationState, readonly ReservationState[]> = {
  reserved: ["ready_for_pickup", "cancelled", "expired"],
  ready_for_pickup: ["issued", "cancelled", "expired"],
  issued: [],
  expired: [],
  cancelled: []
};

export function transitionRequest(from: RequestState, to: RequestState) {
  if (!requestTransitions[from].includes(to)) throw new Error("Invalid request transition");
  return to;
}

export function transitionReservation(from: ReservationState, to: ReservationState) {
  if (!reservationTransitions[from].includes(to)) throw new Error("Invalid reservation transition");
  return to;
}

export function transitionLoan(from: LoanState, to: LoanState | "overdue") {
  if (to === "overdue") return { state: from, overdue: from !== "returned" };
  const allowed: Record<LoanState, readonly LoanState[]> = {
    active: ["partially_returned", "returned"],
    partially_returned: ["partially_returned", "returned"],
    returned: []
  };
  if (!allowed[from].includes(to)) throw new Error("Invalid loan transition");
  return { state: to, overdue: false };
}
