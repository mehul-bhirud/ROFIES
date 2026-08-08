export function normalizeInstitutionalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateInstitutionalEmail(email: string, allowedDomains: readonly string[]) {
  const normalized = normalizeInstitutionalEmail(email);
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return false;
  const domain = normalized.slice(separator + 1);
  return allowedDomains.some((allowed) => domain === allowed.trim().toLowerCase());
}

export function isAllowedInstitutionalIdentity(
  identity: { email: string | null | undefined; emailVerified: boolean | null | undefined },
  allowedDomains: readonly string[]
) {
  if (!identity.email || identity.emailVerified !== true) return false;
  return validateInstitutionalEmail(identity.email, allowedDomains);
}
