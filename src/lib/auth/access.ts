const publicPrefixes = ["/auth/", "/_next/"] as const;
const publicPaths = new Set([
  "/offline",
  "/manifest.webmanifest",
  "/rofies-mark.svg",
  "/favicon.ico"
]);

const staffCapabilities = new Set([
  "request:approve",
  "inventory:manage",
  "circulation:handover",
  "circulation:return",
  "membership:manage",
  "roles:manage",
  "audit:read",
  "reports:export",
  "system:manage"
]);

export function isPublicApplicationPath(pathname: string) {
  return publicPaths.has(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function hasStaffCapability(capabilities: readonly string[]) {
  return capabilities.some((capability) => staffCapabilities.has(capability));
}
