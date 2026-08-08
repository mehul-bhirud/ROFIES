import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRetentionJob, type RetentionJobDependencies } from "@/app/api/jobs/retention/route";

vi.mock("server-only", () => ({}));

const dueDocument = {
  documentId: "11111111-1111-4111-8111-111111111111",
  bucketId: "college-ids",
  objectName: "applications/22222222-2222-4222-8222-222222222222/private-id.webp"
};

function retentionRequest(secret: string | null) {
  return new Request("http://localhost:3000/api/jobs/retention", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {}
  });
}

function createDependencies(
  overrides: Partial<RetentionJobDependencies> = {}
): RetentionJobDependencies & {
  deletedObjects: string[];
  markedDocuments: string[];
  releasedClaims: string[];
  auditEvents: Array<Record<string, unknown>>;
  logs: Array<{ event: string; fields: Record<string, unknown> }>;
} {
  const deletedObjects: string[] = [];
  const markedDocuments: string[] = [];
  const releasedClaims: string[] = [];
  const auditEvents: Array<Record<string, unknown>> = [];
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];

  const dependencies: RetentionJobDependencies = {
    cronSecret: "cron-secret-123456",
    startedAt: () => 1000,
    claimExpiredCollegeIds: async () => [dueDocument],
    deleteStorageObject: async (_bucketId, objectName) => {
      deletedObjects.push(objectName);
      return true;
    },
    markCollegeIdDeleted: async (documentId) => {
      markedDocuments.push(documentId);
      return true;
    },
    releaseCollegeIdClaim: async (documentId) => {
      releasedClaims.push(documentId);
    },
    archiveReadNotifications: async (batchSize) => {
      expect(batchSize).toBe(500);
      return 3;
    },
    recordAuditEvent: async (action, targetType, targetId, afterSummary) => {
      auditEvents.push({ action, targetType, targetId, afterSummary });
    },
    log: (event, fields) => logs.push({ event, fields }),
    ...overrides
  };

  return Object.assign(dependencies, {
    deletedObjects,
    markedDocuments,
    releasedClaims,
    auditEvents,
    logs
  });
}

describe("retention job coordination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([null, "wrong-secret"])("returns a non-disclosing 404 for secret %s", async (secret) => {
    const dependencies = createDependencies();
    const response = await handleRetentionJob(retentionRequest(secret), dependencies);

    expect(response.status).toBe(404);
    expect(dependencies.deletedObjects).toEqual([]);
    expect(await response.json()).toEqual({ message: "Not found" });
  });

  it("deletes due college-ID objects before marking metadata deleted", async () => {
    const events: string[] = [];
    const dependencies = createDependencies({
      deleteStorageObject: async (_bucketId, objectName) => {
        events.push(`storage:${objectName}`);
        return true;
      },
      markCollegeIdDeleted: async (documentId) => {
        events.push(`metadata:${documentId}`);
        return true;
      }
    });

    const response = await handleRetentionJob(retentionRequest("cron-secret-123456"), dependencies);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      collegeIdsDeleted: 1,
      notificationsArchived: 3,
      failures: 0
    });
    expect(events).toEqual([
      `storage:${dueDocument.objectName}`,
      `metadata:${dueDocument.documentId}`
    ]);
    expect(dependencies.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "retention.college_id_deleted",
          targetId: dueDocument.documentId
        }),
        expect.objectContaining({ action: "retention.completed", targetId: null })
      ])
    );
  });

  it("does not mark metadata deleted when storage deletion fails and releases the claim", async () => {
    const dependencies = createDependencies({
      deleteStorageObject: async () => false
    });

    const response = await handleRetentionJob(retentionRequest("cron-secret-123456"), dependencies);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      collegeIdsDeleted: 0,
      notificationsArchived: 3,
      failures: 1
    });
    expect(dependencies.markedDocuments).toEqual([]);
    expect(dependencies.releasedClaims).toEqual([dueDocument.documentId]);
    expect(dependencies.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "retention.college_id_delete_failed",
          targetId: dueDocument.documentId
        })
      ])
    );
  });

  it("does not expose object names, identities, or secrets in job logs", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { logEvent } = await import("@/lib/telemetry");

    logEvent("retention.completed", {
      collegeIdsDeleted: 1,
      notificationsArchived: 2,
      failures: 0,
      objectName: dueDocument.objectName,
      institutionalEmail: "student@iiitp.ac.in",
      studentIdentifier: "FIC-2401",
      authorization: "Bearer cron-secret-123456"
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const line = String(consoleSpy.mock.calls[0]?.[0]);
    expect(line).not.toContain(dueDocument.objectName);
    expect(line).not.toContain("student@iiitp.ac.in");
    expect(line).not.toContain("FIC-2401");
    expect(line).not.toContain("cron-secret-123456");
    expect(JSON.parse(line)).toMatchObject({
      objectName: "[REDACTED]",
      institutionalEmail: "[REDACTED]",
      studentIdentifier: "[REDACTED]",
      authorization: "[REDACTED]"
    });
  });

  it("returns 503 without deletion details when database coordination is unavailable", async () => {
    const dependencies = createDependencies({
      claimExpiredCollegeIds: async () => {
        throw new Error("database down");
      }
    });

    const response = await handleRetentionJob(retentionRequest("cron-secret-123456"), dependencies);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      collegeIdsDeleted: 0,
      notificationsArchived: 0,
      failures: 1
    });
    expect(dependencies.logs).toEqual([
      expect.objectContaining({
        event: "retention.failed",
        fields: expect.objectContaining({ outcome: "database_unavailable" })
      })
    ]);
  });
});
