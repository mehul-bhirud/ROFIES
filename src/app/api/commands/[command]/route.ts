import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  addIndividualAssetCommandSchema,
  adjustStockCommandSchema,
  archiveCatalogItemCommandSchema,
  cancelRequestCommandSchema,
  counterIssueCommandSchema,
  createCatalogItemCommandSchema,
  decisionCommandSchema,
  deleteCatalogItemCommandSchema,
  extensionDecisionCommandSchema,
  extensionRequestCommandSchema,
  handoverCommandSchema,
  lossResolutionCommandSchema,
  memberDecisionCommandSchema,
  requestCommandSchema,
  restoreCatalogItemCommandSchema,
  returnCommandSchema,
  updateCatalogItemCommandSchema,
  waitlistCommandSchema
} from "@/lib/validation/commands";
import { getServerEnvironment } from "@/lib/env/server";
import { isTrustedMutationOrigin } from "@/lib/safety/origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/telemetry";

const schemas = {
  request: requestCommandSchema,
  decision: decisionCommandSchema,
  handover: handoverCommandSchema,
  return: returnCommandSchema,
  cancel: cancelRequestCommandSchema,
  waitlist: waitlistCommandSchema,
  extension: extensionRequestCommandSchema,
  extensionDecision: extensionDecisionCommandSchema,
  counterIssue: counterIssueCommandSchema,
  loss: lossResolutionCommandSchema,
  memberDecision: memberDecisionCommandSchema,
  createCatalogItem: createCatalogItemCommandSchema,
  updateCatalogItem: updateCatalogItemCommandSchema,
  archiveCatalogItem: archiveCatalogItemCommandSchema,
  restoreCatalogItem: restoreCatalogItemCommandSchema,
  deleteCatalogItem: deleteCatalogItemCommandSchema,
  adjustStock: adjustStockCommandSchema,
  addIndividualAsset: addIndividualAssetCommandSchema
};
type Command = keyof typeof schemas;

function safeError(referenceId: string, status: number, message: string) {
  return NextResponse.json({ message, referenceId }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ command: string }> }
) {
  const started = performance.now();
  const referenceId = randomUUID();
  const { command: rawCommand } = await context.params;
  if (!(rawCommand in schemas)) return safeError(referenceId, 404, "Command unavailable.");
  const command = rawCommand as Command;
  const env = getServerEnvironment();
  if (!isTrustedMutationOrigin(request.headers.get("origin"), env.ROFIES_APP_ORIGIN)) {
    logEvent("command.failed", { referenceId, command, outcome: "origin_denied" });
    return safeError(referenceId, 403, "Resource unavailable.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > 32_768)
    return safeError(referenceId, 413, "Request body is too large.");
  if (env.maintenanceMode)
    return safeError(
      referenceId,
      503,
      "Protected operations are paused for maintenance. Catalog reads remain available."
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return safeError(referenceId, 400, "Request body must be valid JSON.");
  }
  const parsed = schemas[command].safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        message: "Correct the highlighted operation details.",
        referenceId,
        fields: parsed.error.flatten().fieldErrors
      },
      { status: 422 }
    );

  if (env.demoMode) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    logEvent("command.committed", {
      referenceId,
      command,
      outcome: "demo",
      durationMs: Math.round(performance.now() - started)
    });
    return NextResponse.json({ status: "committed", referenceId, demo: true });
  }

  const client = await createSupabaseServerClient();
  if (!client) return safeError(referenceId, 503, "Protected operations are unavailable.");
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return safeError(referenceId, 401, "Sign in again to continue.");
  const { data: allowed, error: rateError } = await client.schema("api").rpc("consume_rate_limit", {
    command,
    maximum: command === "request" ? 10 : 30,
    window_seconds: 60
  });
  if (rateError || !allowed)
    return safeError(referenceId, 429, "Too many attempts. Wait a minute and retry.");

  let result;
  if (command === "request") {
    const value = requestCommandSchema.parse(body);
    result = await client.schema("api").rpc("create_request", {
      purpose: value.purpose,
      project_name: value.projectName ?? "",
      requested_start: value.requestedStart,
      requested_end: value.requestedEnd,
      team_members: value.teamMembers,
      lines: value.lines.map((line) => ({
        catalog_item_id: line.catalogItemId,
        quantity: line.quantity,
        remarks: line.remarks ?? ""
      })),
      idempotency_key: request.headers.get("idempotency-key") ?? referenceId
    });
  } else if (command === "decision") {
    const value = decisionCommandSchema.parse(body);
    result = await client.schema("api").rpc("decide_request", {
      request_id: value.requestId,
      decisions: value.decisions,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "handover") {
    const value = handoverCommandSchema.parse(body);
    result = await client.schema("api").rpc("confirm_handover", {
      reservation_id: value.reservationId,
      due_at: value.dueAt,
      remarks: value.remarks,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "return") {
    const value = returnCommandSchema.parse(body);
    result = await client.schema("api").rpc("confirm_return", {
      loan_id: value.loanId,
      lines: value.lines,
      remarks: value.remarks,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "cancel") {
    const value = cancelRequestCommandSchema.parse(body);
    result = await client.schema("api").rpc("cancel_request", {
      request_id: value.requestId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "waitlist") {
    const value = waitlistCommandSchema.parse(body);
    result = await client.schema("api").rpc("join_waitlist", {
      catalog_item_id: value.catalogItemId,
      quantity: value.quantity,
      desired_start: value.desiredStart,
      desired_end: value.desiredEnd,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "extension") {
    const value = extensionRequestCommandSchema.parse(body);
    result = await client.schema("api").rpc("request_extension", {
      loan_line_id: value.loanLineId,
      proposed_due_at: value.proposedDueAt,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "extensionDecision") {
    const value = extensionDecisionCommandSchema.parse(body);
    result = await client.schema("api").rpc("decide_extension", {
      extension_request_id: value.extensionRequestId,
      decision: value.decision,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "counterIssue") {
    const value = counterIssueCommandSchema.parse(body);
    result = await client.schema("api").rpc("counter_issue", {
      member_id: value.memberId,
      catalog_item_id: value.catalogItemId,
      quantity: value.quantity,
      remarks: value.remarks,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "loss") {
    const value = lossResolutionCommandSchema.parse(body);
    result = await client.schema("api").rpc("resolve_loss", {
      loan_line_id: value.loanLineId,
      quantity: value.quantity,
      resolution: value.resolution,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "createCatalogItem") {
    const value = createCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("create_catalog_item", {
      category_id: value.categoryId,
      name: value.name,
      description: value.description ?? "",
      tracking_mode: value.trackingMode,
      public_remarks: value.publicRemarks ?? "",
      internal_remarks: value.internalRemarks ?? "",
      default_loan_days: value.defaultLoanDays ?? null,
      maximum_loan_days: value.maximumLoanDays ?? null,
      member_quantity_limit: value.memberQuantityLimit ?? null,
      pickup_window_hours: value.pickupWindowHours ?? null,
      waitlist_enabled: value.waitlistEnabled,
      counter_issue_enabled: value.counterIssueEnabled,
      low_stock_threshold: value.lowStockThreshold ?? null,
      acquisition_date: value.acquisitionDate ?? null,
      supplier: value.supplier ?? null,
      warranty_until: value.warrantyUntil ?? null,
      replacement_cost: value.replacementCost ?? null,
      tags: value.tags,
      opening_units: value.openingUnits.map((unit) => ({
        storage_location_id: unit.storageLocationId ?? null,
        condition: unit.condition,
        quantity: unit.quantity ?? null,
        local_identifier: unit.localIdentifier ?? null
      })),
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "updateCatalogItem") {
    const value = updateCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("update_catalog_item", {
      catalog_item_id: value.catalogItemId,
      category_id: value.categoryId,
      name: value.name,
      description: value.description ?? "",
      public_remarks: value.publicRemarks ?? "",
      internal_remarks: value.internalRemarks ?? "",
      default_loan_days: value.defaultLoanDays ?? null,
      maximum_loan_days: value.maximumLoanDays ?? null,
      member_quantity_limit: value.memberQuantityLimit ?? null,
      pickup_window_hours: value.pickupWindowHours ?? null,
      waitlist_enabled: value.waitlistEnabled,
      counter_issue_enabled: value.counterIssueEnabled,
      low_stock_threshold: value.lowStockThreshold ?? null,
      acquisition_date: value.acquisitionDate ?? null,
      supplier: value.supplier ?? null,
      warranty_until: value.warrantyUntil ?? null,
      replacement_cost: value.replacementCost ?? null,
      tags: value.tags,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "archiveCatalogItem") {
    const value = archiveCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("archive_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "restoreCatalogItem") {
    const value = restoreCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("restore_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "deleteCatalogItem") {
    const value = deleteCatalogItemCommandSchema.parse(body);
    result = await client.schema("api").rpc("delete_catalog_item", {
      catalog_item_id: value.catalogItemId,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "adjustStock") {
    const value = adjustStockCommandSchema.parse(body);
    result = await client.schema("api").rpc("adjust_stock", {
      catalog_item_id: value.catalogItemId,
      storage_location_id: value.storageLocationId ?? null,
      condition: value.condition,
      quantity_delta: value.quantityDelta,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else if (command === "addIndividualAsset") {
    const value = addIndividualAssetCommandSchema.parse(body);
    result = await client.schema("api").rpc("add_individual_asset", {
      catalog_item_id: value.catalogItemId,
      local_identifier: value.localIdentifier ?? null,
      storage_location_id: value.storageLocationId ?? null,
      condition: value.condition,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  } else {
    const value = memberDecisionCommandSchema.parse(body);
    result = await client.schema("api").rpc("review_member_application", {
      application_id: value.applicationId,
      decision: value.decision,
      reason: value.reason,
      idempotency_key: value.idempotencyKey
    });
  }
  if (result.error) {
    logEvent("command.failed", {
      referenceId,
      command,
      actorId: userData.user.id,
      outcome: result.error.code,
      durationMs: Math.round(performance.now() - started)
    });
    const conflict = result.error.code === "40001";
    const denied = result.error.code === "42501";
    return safeError(
      referenceId,
      conflict ? 409 : denied ? 404 : 400,
      conflict
        ? "The record changed. Refresh and review current availability."
        : denied
          ? "Resource unavailable."
          : "The operation could not be committed."
    );
  }
  logEvent("command.committed", {
    referenceId,
    command,
    actorId: userData.user.id,
    outcome: "committed",
    durationMs: Math.round(performance.now() - started)
  });
  return NextResponse.json({ status: "committed", referenceId, result: result.data });
}
