import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { provisionConfirmedApplicant } from "@/lib/auth/profile-provisioning";

type Failure = Error | "reject" | null;

function result(failure: Failure) {
  if (failure === "reject") return Promise.reject(new Error("raw database failure"));
  return Promise.resolve({ error: failure });
}

function createServiceDouble({
  profileExists = true,
  lookupFailure = null,
  insertFailure = null,
  updateFailure = null,
  applicationFailures = [null]
}: {
  profileExists?: boolean;
  lookupFailure?: Failure;
  insertFailure?: Failure;
  updateFailure?: Failure;
  applicationFailures?: Failure[];
} = {}) {
  let exists = profileExists;
  let applicationAttempt = 0;
  const lookup = vi.fn(async () => {
    const response = await result(lookupFailure);
    return { data: exists ? { id: "user-1" } : null, error: response.error };
  });
  const insert = vi.fn(async () => {
    const response = await result(insertFailure);
    if (!response.error) exists = true;
    return response;
  });
  const update = vi.fn((values: Record<string, unknown>) => {
    void values;
    return { eq: vi.fn(async () => result(updateFailure)) };
  });
  const applicationUpsert = vi.fn(async () => {
    const failure = applicationFailures[applicationAttempt] ?? null;
    applicationAttempt += 1;
    return result(failure);
  });
  const service = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: lookup }) }),
          insert,
          update
        };
      }
      return { upsert: applicationUpsert };
    })
  } as unknown as SupabaseClient;
  return { service, insert, update, applicationUpsert };
}

const user = { id: "user-1", email: "student@iiitp.ac.in" };
const authenticatedAt = "2026-08-08T10:00:00.000Z";

describe("confirmed applicant provisioning", () => {
  it("refreshes an existing profile without changing its activation state", async () => {
    const { service, update, applicationUpsert } = createServiceDouble();

    const provisioned = await provisionConfirmedApplicant(service, user, authenticatedAt);

    expect(provisioned).toBe(true);
    expect(update).toHaveBeenCalledWith({
      last_authenticated_at: authenticatedAt,
      updated_at: authenticatedAt
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("active");
    expect(applicationUpsert).toHaveBeenCalledWith(
      { profile_id: "user-1", state: "incomplete" },
      { onConflict: "profile_id", ignoreDuplicates: true }
    );
  });

  it("fails closed on a profile lookup error", async () => {
    const { service } = createServiceDouble({ lookupFailure: new Error("lookup failed") });
    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(false);
  });

  it("fails closed when a new profile cannot be inserted", async () => {
    const { service, applicationUpsert } = createServiceDouble({
      profileExists: false,
      insertFailure: new Error("insert failed")
    });
    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(false);
    expect(applicationUpsert).not.toHaveBeenCalled();
  });

  it("fails closed when an existing profile timestamp cannot be updated", async () => {
    const { service, applicationUpsert } = createServiceDouble({
      updateFailure: new Error("update failed")
    });
    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(false);
    expect(applicationUpsert).not.toHaveBeenCalled();
  });

  it("fails closed when the application write fails", async () => {
    const { service } = createServiceDouble({
      applicationFailures: [new Error("application failed")]
    });
    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(false);
  });

  it("repairs a partial profile on a later idempotent retry", async () => {
    const { service, insert, update, applicationUpsert } = createServiceDouble({
      profileExists: false,
      applicationFailures: [new Error("transient application failure"), null]
    });

    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(false);
    expect(await provisionConfirmedApplicant(service, user, authenticatedAt)).toBe(true);
    expect(insert).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(applicationUpsert).toHaveBeenCalledTimes(2);
  });

  it("contains a rejected database operation as a closed failure", async () => {
    const { service } = createServiceDouble({ lookupFailure: "reject" });
    await expect(provisionConfirmedApplicant(service, user, authenticatedAt)).resolves.toBe(false);
  });
});
