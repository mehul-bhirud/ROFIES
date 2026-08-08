const secretKeys =
  /authorization|cookie|password|secret|token|api[-_]?key|database[-_]?url|email|phone|student|object[-_]?name|signed[-_]?url|url/i;

export function redactTelemetry(value: unknown, key = ""): unknown {
  if (secretKeys.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactTelemetry(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactTelemetry(entryValue, entryKey)
      ])
    );
  }
  return value;
}
