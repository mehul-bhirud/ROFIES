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

const catalogCondition = z.enum(["perfect", "minor_damage", "repair_required", "not_working"]);

const catalogItemMetadataFields = {
  categoryId: databaseId,
  name: boundedText(2, 160),
  description: boundedText(0, 4000).optional(),
  publicRemarks: boundedText(0, 2000).optional(),
  internalRemarks: boundedText(0, 4000).optional(),
  defaultLoanDays: z.number().int().min(1).max(90).optional(),
  maximumLoanDays: z.number().int().min(1).max(180).optional(),
  memberQuantityLimit: z.number().int().min(1).optional(),
  pickupWindowHours: z.number().int().min(1).max(168).optional(),
  waitlistEnabled: z.boolean().default(true),
  counterIssueEnabled: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).optional(),
  acquisitionDate: z.iso.date().optional(),
  supplier: boundedText(1, 200).optional(),
  warrantyUntil: z.iso.date().optional(),
  replacementCost: z.number().min(0).optional(),
  tags: z.array(boundedText(1, 60)).max(20).default([])
};

function loanDaysOrdered(value: any) {
  return (
    value.maximumLoanDays === undefined ||
    value.defaultLoanDays === undefined ||
    value.maximumLoanDays >= value.defaultLoanDays
  );
}

export const createCatalogItemCommandSchema = z
  .object({
    ...catalogItemMetadataFields,
    trackingMode: z.enum(["pooled_reusable", "individual_asset", "consumable"]),
    openingUnits: z
      .array(
        z.object({
          storageLocationId: databaseId.optional(),
          condition: catalogCondition.default("perfect"),
          quantity: z.number().int().min(1).max(1000).optional(),
          localIdentifier: boundedText(1, 120).optional()
        })
      )
      .max(50)
      .default([]),
    idempotencyKey: boundedText(12, 120)
  })
  .refine(loanDaysOrdered, {
    message: "Maximum loan days must be at least default loan days",
    path: ["maximumLoanDays"]
  });

export const updateCatalogItemCommandSchema = z
  .object({
    catalogItemId: databaseId,
    ...catalogItemMetadataFields,
    reason: boundedText(3, 1000),
    idempotencyKey: boundedText(12, 120)
  })
  .refine(loanDaysOrdered, {
    message: "Maximum loan days must be at least default loan days",
    path: ["maximumLoanDays"]
  });

export const archiveCatalogItemCommandSchema = z.object({
  catalogItemId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const restoreCatalogItemCommandSchema = archiveCatalogItemCommandSchema;

export const deleteCatalogItemCommandSchema = z.object({
  catalogItemId: databaseId,
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const adjustStockCommandSchema = z.object({
  catalogItemId: databaseId,
  storageLocationId: databaseId.optional(),
  condition: catalogCondition,
  quantityDelta: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, { message: "Quantity delta must not be zero" }),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});

export const addIndividualAssetCommandSchema = z.object({
  catalogItemId: databaseId,
  localIdentifier: boundedText(1, 120).optional(),
  storageLocationId: databaseId.optional(),
  condition: catalogCondition.default("perfect"),
  reason: boundedText(3, 1000),
  idempotencyKey: boundedText(12, 120)
});
