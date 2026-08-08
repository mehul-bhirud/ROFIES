import "server-only";
import { redactTelemetry } from "@/lib/safety/redaction";

export function logEvent(event: string, fields: Record<string, unknown>) {
  const payload = redactTelemetry({
    timestamp: new Date().toISOString(),
    severity: event.endsWith("failed") ? "error" : "info",
    service: "rofies-web",
    event,
    ...fields
  });
  const line = JSON.stringify(payload);
  if (event.endsWith("failed")) console.error(line);
  else console.info(line);
}

export function durationMsSince(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
