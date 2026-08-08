import { describe, expect, it } from "vitest";
import { neutralizeCsvCell, toCsv } from "@/lib/safety/csv";
import { redactTelemetry } from "@/lib/safety/redaction";

describe("output safety", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\t=1", "\r=1"])(
    "neutralizes spreadsheet formula input %s",
    (value) => expect(neutralizeCsvCell(value).startsWith("'")).toBe(true)
  );

  it("quotes CSV values containing commas and quotes", () => {
    expect(
      toCsv([
        ["name", "remark"],
        ["Servo", 'said "ready, now"']
      ])
    ).toBe('name,remark\r\nServo,"said ""ready, now"""');
  });

  it("redacts secrets recursively while preserving safe identifiers", () => {
    expect(
      redactTelemetry({
        requestId: "req-1",
        authorization: "Bearer secret",
        nested: { cookie: "session", itemId: "item-1" }
      })
    ).toEqual({
      requestId: "req-1",
      authorization: "[REDACTED]",
      nested: { cookie: "[REDACTED]", itemId: "item-1" }
    });
  });
});
