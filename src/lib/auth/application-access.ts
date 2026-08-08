export type MemberApplicationState =
  "incomplete" | "pending_review" | "changes_requested" | "approved" | "rejected";

export type ApplicationDestination = "/onboarding" | "/pending" | "/" | "/auth/error";

export type ApplicationAccessInput = {
  emailConfirmed: boolean;
  active: boolean;
  applicationState: MemberApplicationState | null;
};

export type MemberApplicationStatus = {
  applicationId: string;
  state: MemberApplicationState;
  membershipStatus: string;
  decisionReason: string | null;
};

const onboardingStates = new Set<MemberApplicationState>(["incomplete", "changes_requested"]);
const pendingStates = new Set<MemberApplicationState>(["pending_review", "rejected"]);
const applicationStates = new Set<MemberApplicationState>([
  "incomplete",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected"
]);

export function applicationDestination(input: ApplicationAccessInput): ApplicationDestination {
  if (!input.emailConfirmed || !input.applicationState) return "/auth/error";
  if (input.active && input.applicationState === "approved") return "/";
  if (!input.active && onboardingStates.has(input.applicationState)) return "/onboarding";
  if (!input.active && pendingStates.has(input.applicationState)) return "/pending";
  return "/auth/error";
}

export function parseMemberApplicationStatus(value: unknown): MemberApplicationStatus | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const applicationId = record.application_id;
  const state = record.state;
  const membershipStatus = record.membership_status;
  const decisionReason = record.decision_reason;
  if (
    typeof applicationId !== "string" ||
    typeof state !== "string" ||
    !applicationStates.has(state as MemberApplicationState) ||
    typeof membershipStatus !== "string" ||
    (decisionReason !== null && decisionReason !== undefined && typeof decisionReason !== "string")
  )
    return null;
  return {
    applicationId,
    state: state as MemberApplicationState,
    membershipStatus,
    decisionReason: typeof decisionReason === "string" ? decisionReason : null
  };
}
