export function isTrustedMutationOrigin(origin: string | null, configuredOrigin: string) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(configuredOrigin).origin;
  } catch {
    return false;
  }
}
