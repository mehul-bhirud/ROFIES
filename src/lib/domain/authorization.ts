export type MembershipState = "inactive" | "active" | "suspended" | "former";

export type Capability =
  | "request:create"
  | "request:approve"
  | "inventory:manage"
  | "circulation:handover"
  | "circulation:return"
  | "membership:manage"
  | "roles:manage"
  | "audit:read"
  | "reports:export"
  | "system:manage";

export interface Actor {
  userId: string;
  active: boolean;
  membership: MembershipState;
  capabilities: readonly Capability[];
}

export interface ResourceContext {
  ownerId?: string;
  recentAuthentication?: boolean;
}

const recentAuthenticationCapabilities = new Set<Capability>(["roles:manage", "reports:export"]);

export function can(actor: Actor | null, capability: Capability, resource: ResourceContext = {}) {
  if (!actor?.active) return false;

  if (capability === "request:create") {
    return (
      actor.membership === "active" && (!resource.ownerId || resource.ownerId === actor.userId)
    );
  }

  if (!actor.capabilities.includes(capability)) return false;
  if (capability === "request:approve" && resource.ownerId === actor.userId) return false;
  if (recentAuthenticationCapabilities.has(capability) && resource.recentAuthentication === false) {
    return false;
  }
  return true;
}

export class AuthorizationError extends Error {
  readonly code = "resource_unavailable";

  constructor() {
    super("Resource unavailable");
    this.name = "AuthorizationError";
  }
}

export function authorize(
  actor: Actor | null,
  capability: Capability,
  resource: ResourceContext = {}
): asserts actor is Actor {
  if (!can(actor, capability, resource)) throw new AuthorizationError();
}
