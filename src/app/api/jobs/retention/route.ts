import { timingSafeEqual } from "node:crypto";
import { durationMsSince, logEvent } from "@/lib/telemetry";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type ClaimedCollegeId = {
  documentId: string;
  bucketId: string;
  objectName: string;
};

type RetentionResult = {
  collegeIdsDeleted: number;
  notificationsArchived: number;
  failures: number;
};

export type RetentionJobDependencies = {
  cronSecret: string | undefined;
  startedAt: () => number;
  claimExpiredCollegeIds: (batchSize: number) => Promise<ClaimedCollegeId[]>;
  deleteStorageObject: (bucketId: string, objectName: string) => Promise<boolean>;
  markCollegeIdDeleted: (documentId: string) => Promise<boolean>;
  releaseCollegeIdClaim: (documentId: string) => Promise<void>;
  archiveReadNotifications: (batchSize: number) => Promise<number>;
  recordAuditEvent: (
    action: string,
    targetType: string,
    targetId: string | null,
    afterSummary: Record<string, unknown>
  ) => Promise<void>;
  log: (event: string, fields: Record<string, unknown>) => void;
};

function isAuthorized(request: Request, cronSecret: string | undefined) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!cronSecret || !authorization.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length);
  const expected = Buffer.from(cronSecret);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function unavailable() {
  return Response.json({ message: "Not found" }, { status: 404 });
}

export async function handleRetentionJob(request: Request, dependencies: RetentionJobDependencies) {
  if (!isAuthorized(request, dependencies.cronSecret)) return unavailable();

  const startedAt = dependencies.startedAt();
  const result: RetentionResult = {
    collegeIdsDeleted: 0,
    notificationsArchived: 0,
    failures: 0
  };

  try {
    const documents = await dependencies.claimExpiredCollegeIds(100);
    for (const document of documents) {
      const deleted = await dependencies.deleteStorageObject(
        document.bucketId,
        document.objectName
      );
      if (!deleted) {
        result.failures += 1;
        await dependencies.releaseCollegeIdClaim(document.documentId);
        await dependencies.recordAuditEvent(
          "retention.college_id_delete_failed",
          "college_id_document",
          document.documentId,
          { outcome: "storage_delete_failed" }
        );
        continue;
      }

      const marked = await dependencies.markCollegeIdDeleted(document.documentId);
      if (marked) {
        result.collegeIdsDeleted += 1;
        await dependencies.recordAuditEvent(
          "retention.college_id_deleted",
          "college_id_document",
          document.documentId,
          { outcome: "deleted" }
        );
      } else {
        result.failures += 1;
        await dependencies.releaseCollegeIdClaim(document.documentId);
        await dependencies.recordAuditEvent(
          "retention.college_id_metadata_failed",
          "college_id_document",
          document.documentId,
          { outcome: "metadata_update_failed" }
        );
      }
    }

    result.notificationsArchived = await dependencies.archiveReadNotifications(500);
    await dependencies.recordAuditEvent("retention.completed", "system", null, {
      collegeIdsDeleted: result.collegeIdsDeleted,
      notificationsArchived: result.notificationsArchived,
      failures: result.failures,
      durationMs: durationMsSince(startedAt)
    });
    dependencies.log("retention.completed", { ...result, durationMs: durationMsSince(startedAt) });
    return Response.json(result);
  } catch {
    dependencies.log("retention.failed", {
      outcome: "database_unavailable",
      durationMs: durationMsSince(startedAt)
    });
    return Response.json(
      { collegeIdsDeleted: 0, notificationsArchived: 0, failures: 1 },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const env = getServerEnvironment();
  const service = createSupabaseServiceClient();
  const dependencies: RetentionJobDependencies = {
    cronSecret: env.CRON_SECRET,
    startedAt: () => performance.now(),
    claimExpiredCollegeIds: async (batchSize) => {
      if (!service) throw new Error("retention_service_unavailable");
      const { data, error } = await service
        .schema("api")
        .rpc("claim_expired_college_ids", { batch_size: batchSize });
      if (error) throw new Error("retention_claim_failed");
      return (
        (data as
          | Array<{ document_id: unknown; bucket_id: unknown; object_name: unknown }>
          | null
          | undefined) ?? []
      ).map((row) => ({
        documentId: String(row.document_id),
        bucketId: String(row.bucket_id),
        objectName: String(row.object_name)
      }));
    },
    deleteStorageObject: async (bucketId, objectName) => {
      if (!service) throw new Error("retention_service_unavailable");
      const { error } = await service.storage.from(bucketId).remove([objectName]);
      return !error;
    },
    markCollegeIdDeleted: async (documentId) => {
      if (!service) throw new Error("retention_service_unavailable");
      const { error } = await service
        .from("college_id_documents")
        .update({ deleted_at: new Date().toISOString(), deletion_claimed_at: null })
        .eq("id", documentId)
        .is("deleted_at", null);
      return !error;
    },
    releaseCollegeIdClaim: async (documentId) => {
      if (!service) throw new Error("retention_service_unavailable");
      await service
        .from("college_id_documents")
        .update({ deletion_claimed_at: null })
        .eq("id", documentId)
        .is("deleted_at", null);
    },
    archiveReadNotifications: async (batchSize) => {
      if (!service) throw new Error("retention_service_unavailable");
      const { data, error } = await service
        .schema("api")
        .rpc("archive_read_notifications", { batch_size: batchSize });
      if (error) throw new Error("retention_archive_failed");
      return Number((data as { archived?: unknown } | null)?.archived ?? 0);
    },
    recordAuditEvent: async (action, targetType, targetId, afterSummary) => {
      if (!service) throw new Error("retention_service_unavailable");
      await service.from("audit_events").insert({
        action,
        target_type: targetType,
        target_id: targetId,
        after_summary: afterSummary
      });
    },
    log: logEvent
  };
  return handleRetentionJob(request, dependencies);
}
