import { z } from "zod";

const isoInstant = z.iso.datetime({ offset: true });
const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
const databaseId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid identifier");

export const requestCommandSchema = z
  .object({
    purpose: boundedText(3, 1000),
    projectName: boundedText(1, 160).optional(),
    requestedStart: isoInstant,
    requestedEnd: isoInstant,
    teamMembers: z.array(boundedText(1, 120)).max(20).default([]),
    lines: z
      .array(
        z.object({
          catalogItemId: databaseId,
          quantity: z.number().int().min(1).max(50),
          remarks: boundedText(1, 1000).optional()
        })
      )
      .min(1)
      .max(20)
  })
  .refine((value) => new Date(value.requestedEnd) > new Date(value.requestedStart), {
    message: "End must be after start",
    path: ["requestedEnd"]
  });

export const decisionCommandSchema = z.object({
  requestId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120),
  decisions: z
    .array(
      z.object({
        line_id: databaseId,
        decision: z.enum(["approved", "reduced", "rejected", "changes_requested"]),
        approved_quantity: z.number().int().min(0).max(50),
        reason: boundedText(3, 1000).optional()
      })
    )
    .min(1)
    .max(20)
});

export const handoverCommandSchema = z.object({
  reservationId: databaseId,
  dueAt: isoInstant,
  remarks: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const returnCommandSchema = z.object({
  loanId: databaseId,
  remarks: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120),
  lines: z
    .array(
      z.object({
        loan_line_id: databaseId,
        quantity: z.number().int().min(1).max(50),
        condition: z.enum(["perfect", "minor_damage", "repair_required", "not_working"])
      })
    )
    .min(1)
    .max(20)
});

export const cancelRequestCommandSchema = z.object({
  requestId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const waitlistCommandSchema = z
  .object({
    catalogItemId: databaseId,
    quantity: z.number().int().min(1).max(50),
    desiredStart: isoInstant,
    desiredEnd: isoInstant,
    idempotencyKey: boundedText(12, 120)
  })
  .refine((value) => new Date(value.desiredEnd) > new Date(value.desiredStart), {
    message: "End must be after start",
    path: ["desiredEnd"]
  });

export const extensionRequestCommandSchema = z.object({
  loanLineId: databaseId,
  proposedDueAt: isoInstant,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const extensionDecisionCommandSchema = z.object({
  extensionRequestId: databaseId,
  decision: z.enum(["approved", "rejected"]),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const counterIssueCommandSchema = z.object({
  memberId: databaseId,
  catalogItemId: databaseId,
  quantity: z.number().int().min(1).max(50),
  remarks: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const lossResolutionCommandSchema = z.object({
  loanLineId: databaseId,
  quantity: z.number().int().min(1).max(50),
  resolution: z.enum(["lost", "written_off"]),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const memberDecisionCommandSchema = z.object({
  applicationId: databaseId,
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  reason: boundedText(3, 500),
  idempotencyKey: boundedText(12, 120)
});
