import { randomUUID } from "node:crypto";
import { parseMemberApplicationStatus } from "@/lib/auth/application-access";
import {
  handleMemberApplicationRequest,
  type MemberApplicationDependencies
} from "@/lib/auth/member-application";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const environment = getServerEnvironment();
  if (environment.demoMode) {
    return handleMemberApplicationRequest(request, {
      appOrigin: environment.ROFIES_APP_ORIGIN,
      allowedEmailDomains: environment.allowedEmailDomains,
      maintenanceMode: environment.maintenanceMode,
      createReferenceId: randomUUID,
      createObjectId: randomUUID,
      getCurrentUser: async () => ({
        id: "demo-applicant",
        email: "demo.student@iiitp.ac.in",
        emailConfirmedAt: new Date().toISOString()
      }),
      getApplicationStatus: async () => ({
        applicationId: "00000000-0000-0000-0000-000000000101",
        state: "incomplete",
        membershipStatus: "inactive",
        decisionReason: null
      }),
      consumeRateLimit: async () => true,
      uploadCollegeId: async () => ({ ok: true }),
      registerCollegeId: async () => ({ ok: true }),
      submitApplication: async () => ({ ok: true }),
      removeCollegeId: async () => {}
    });
  }
  const client = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  let callerApplicationId: string | null = null;

  const dependencies: MemberApplicationDependencies = {
    appOrigin: environment.ROFIES_APP_ORIGIN,
    allowedEmailDomains: environment.allowedEmailDomains,
    maintenanceMode: environment.maintenanceMode,
    createReferenceId: randomUUID,
    createObjectId: randomUUID,
    getCurrentUser: async () => {
      if (!client || !service) throw new Error("application_service_unavailable");
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        emailConfirmedAt: data.user.email_confirmed_at ?? null
      };
    },
    getApplicationStatus: async () => {
      if (!client) throw new Error("application_service_unavailable");
      const { data, error } = await client.schema("api").rpc("member_application_status");
      if (error) throw new Error("application_status_unavailable");
      const status = parseMemberApplicationStatus(data);
      callerApplicationId = status?.applicationId ?? null;
      return status;
    },
    consumeRateLimit: async () => {
      if (!client) throw new Error("application_service_unavailable");
      const { data, error } = await client.schema("api").rpc("consume_rate_limit", {
        command: "member_application",
        maximum: 5,
        window_seconds: 900
      });
      if (error) throw new Error("application_rate_limit_unavailable");
      return data === true;
    },
    uploadCollegeId: async (objectName, bytes, metadata) => {
      if (!service) return { ok: false };
      const { error } = await service.storage.from("college-ids").upload(objectName, bytes, {
        contentType: metadata.contentType,
        cacheControl: "0",
        upsert: false,
        metadata: { rofies_processed: "true" }
      });
      return { ok: !error };
    },
    registerCollegeId: async (metadata) => {
      if (!service) return { ok: false };
      const parameters = {
        application_id: metadata.applicationId,
        object_name: metadata.objectName,
        byte_size: metadata.byteSize,
        width: metadata.width,
        height: metadata.height,
        checksum_sha256: metadata.sha256
      };
      const first = await service.schema("api").rpc("register_college_id_document", parameters);
      if (!first.error) return { ok: true };
      const verificationRetry = await service
        .schema("api")
        .rpc("register_college_id_document", parameters);
      return { ok: !verificationRetry.error };
    },
    submitApplication: async (fields) => {
      if (!client) return { ok: false };
      const { error } = await client.schema("api").rpc("submit_member_application", {
        display_name: fields.displayName,
        student_identifier: fields.studentIdentifier,
        study_year: fields.studyYear,
        department: fields.department,
        phone: fields.phone
      });
      if (!error) return { ok: true };
      const verification = await client.schema("api").rpc("member_application_status");
      const status = verification.error ? null : parseMemberApplicationStatus(verification.data);
      return {
        ok: Boolean(
          status &&
          callerApplicationId &&
          status.applicationId === callerApplicationId &&
          status.state === "pending_review"
        )
      };
    },
    removeCollegeId: async (objectName) => {
      if (!service) throw new Error("application_cleanup_unavailable");
      const { error } = await service.storage.from("college-ids").remove([objectName]);
      if (error) throw new Error("application_cleanup_failed");
    }
  };

  return handleMemberApplicationRequest(request, dependencies);
}
