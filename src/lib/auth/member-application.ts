import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  applicationDestination,
  type MemberApplicationStatus
} from "@/lib/auth/application-access";
import { isAllowedInstitutionalIdentity } from "@/lib/auth/identity";
import { MAX_COLLEGE_ID_SOURCE_BYTES, normalizeCollegeId } from "@/lib/safety/images";
import { isTrustedMutationOrigin } from "@/lib/safety/origin";

export const MAX_COLLEGE_ID_INPUT_BYTES = MAX_COLLEGE_ID_SOURCE_BYTES;
export const MAX_MEMBER_APPLICATION_BODY_BYTES = MAX_COLLEGE_ID_INPUT_BYTES + 256 * 1024;

type CurrentUser = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
};

type ApplicationFields = {
  displayName: string;
  studentIdentifier: string;
  studyYear: number;
  department: string;
  phone: string | null;
};

type CollegeIdMetadata = {
  applicationId: string;
  objectName: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
};

type PortResult = { ok: boolean };

export type MemberApplicationDependencies = {
  appOrigin: string;
  allowedEmailDomains: readonly string[];
  maintenanceMode: boolean;
  createReferenceId: () => string;
  createObjectId: () => string;
  getCurrentUser: () => Promise<CurrentUser | null>;
  getApplicationStatus: () => Promise<MemberApplicationStatus | null>;
  consumeRateLimit: () => Promise<boolean>;
  uploadCollegeId: (
    objectName: string,
    bytes: Uint8Array,
    metadata: { contentType: "image/webp"; byteSize: number }
  ) => Promise<PortResult>;
  registerCollegeId: (metadata: CollegeIdMetadata) => Promise<PortResult>;
  submitApplication: (fields: ApplicationFields) => Promise<PortResult>;
  removeCollegeId: (objectName: string) => Promise<void>;
};

const applicationFieldsSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  studentIdentifier: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(120),
  studyYear: z.coerce.number().int().min(1).max(8),
  phone: z
    .string()
    .trim()
    .max(24)
    .refine((value) => value.length === 0 || value.length >= 7)
    .transform((value) => value || null)
});

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

function errorResponse(message: string, referenceId: string, status: number) {
  return json({ message, referenceId }, status);
}

function hasOneEntry(form: FormData, name: string, optional = false) {
  const count = form.getAll(name).length;
  return optional ? count <= 1 : count === 1;
}

async function removeUploadedObject(
  dependencies: MemberApplicationDependencies,
  objectName: string
) {
  try {
    await dependencies.removeCollegeId(objectName);
  } catch {
    // The response remains generic; retention monitoring must surface cleanup failures.
  }
}

export async function handleMemberApplicationRequest(
  request: Request,
  dependencies: MemberApplicationDependencies
) {
  const referenceId = dependencies.createReferenceId();
  if (!isTrustedMutationOrigin(request.headers.get("origin"), dependencies.appOrigin))
    return errorResponse("Resource unavailable.", referenceId, 403);

  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)
    return errorResponse("A bounded upload is required.", referenceId, 411);
  if (declaredLength > MAX_MEMBER_APPLICATION_BODY_BYTES)
    return errorResponse("The upload is too large.", referenceId, 413);
  if (dependencies.maintenanceMode)
    return errorResponse("Protected operations are paused.", referenceId, 503);

  let user: CurrentUser | null;
  let application: MemberApplicationStatus | null;
  try {
    user = await dependencies.getCurrentUser();
    if (
      !user ||
      !isAllowedInstitutionalIdentity(
        { email: user.email, emailVerified: Boolean(user.emailConfirmedAt) },
        dependencies.allowedEmailDomains
      )
    )
      return errorResponse("Resource unavailable.", referenceId, 404);
    application = await dependencies.getApplicationStatus();
  } catch {
    return errorResponse("Application service is unavailable.", referenceId, 503);
  }

  if (!application) return errorResponse("Resource unavailable.", referenceId, 404);
  const destination = applicationDestination({
    emailConfirmed: true,
    active: application.membershipStatus === "active",
    applicationState: application.state
  });
  if (destination === "/pending" && application.state === "pending_review")
    return json({ status: "pending_review", referenceId }, 200);
  if (destination !== "/onboarding")
    return errorResponse("Application is not open for submission.", referenceId, 409);

  try {
    if (!(await dependencies.consumeRateLimit()))
      return errorResponse("Too many attempts. Wait before retrying.", referenceId, 429);
  } catch {
    return errorResponse("Application service is unavailable.", referenceId, 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Choose a valid college-ID image.", referenceId, 400);
  }
  if (
    !hasOneEntry(form, "fullName") ||
    !hasOneEntry(form, "studentIdentifier") ||
    !hasOneEntry(form, "department") ||
    !hasOneEntry(form, "studyYear") ||
    !hasOneEntry(form, "phone", true) ||
    !hasOneEntry(form, "collegeId")
  )
    return errorResponse("Check the highlighted application fields.", referenceId, 422);

  const parsed = applicationFieldsSchema.safeParse({
    fullName: form.get("fullName"),
    studentIdentifier: form.get("studentIdentifier"),
    department: form.get("department"),
    studyYear: form.get("studyYear"),
    phone: form.get("phone") ?? ""
  });
  const collegeId = form.get("collegeId");
  if (!parsed.success || typeof File === "undefined" || !(collegeId instanceof File))
    return errorResponse("Check the highlighted application fields.", referenceId, 422);
  if (collegeId.size > MAX_COLLEGE_ID_INPUT_BYTES)
    return errorResponse("The college-ID image is too large.", referenceId, 413);

  let normalized: Awaited<ReturnType<typeof normalizeCollegeId>>;
  try {
    normalized = await normalizeCollegeId(Buffer.from(await collegeId.arrayBuffer()));
  } catch {
    return errorResponse("Use one JPEG, PNG, or WebP image up to 8 MB.", referenceId, 422);
  }

  const objectName = `applications/${application.applicationId}/${dependencies.createObjectId()}.webp`;
  let uploaded: PortResult;
  try {
    uploaded = await dependencies.uploadCollegeId(objectName, normalized.data, {
      contentType: normalized.contentType,
      byteSize: normalized.byteSize
    });
  } catch {
    uploaded = { ok: false };
  }
  if (!uploaded.ok)
    return errorResponse("Application upload is unavailable. Retry shortly.", referenceId, 503);

  const metadata: CollegeIdMetadata = {
    applicationId: application.applicationId,
    objectName,
    width: normalized.width,
    height: normalized.height,
    byteSize: normalized.byteSize,
    sha256: createHash("sha256").update(normalized.data).digest("hex")
  };
  let registered: PortResult;
  try {
    registered = await dependencies.registerCollegeId(metadata);
  } catch {
    registered = { ok: false };
  }
  if (!registered.ok) {
    await removeUploadedObject(dependencies, objectName);
    return errorResponse(
      "Application could not be submitted. Review your details and retry.",
      referenceId,
      409
    );
  }

  let submitted: PortResult;
  try {
    submitted = await dependencies.submitApplication({
      displayName: parsed.data.fullName,
      studentIdentifier: parsed.data.studentIdentifier,
      studyYear: parsed.data.studyYear,
      department: parsed.data.department,
      phone: parsed.data.phone
    });
  } catch {
    submitted = { ok: false };
  }
  if (!submitted.ok) {
    await removeUploadedObject(dependencies, objectName);
    return errorResponse(
      "Application could not be submitted. Review your details and retry.",
      referenceId,
      409
    );
  }

  return json({ status: "pending_review", referenceId }, 201);
}
