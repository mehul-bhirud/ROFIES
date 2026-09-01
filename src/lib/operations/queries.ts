import "server-only";
import { cache } from "react";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoActivity, demoApprovalQueue, demoMemberRequests, demoSummary } from "@/lib/demo-data";
import type { OperationalSummary } from "@/lib/catalog/types";

export interface ApprovalLine {
  lineId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
}
export interface ApprovalRecord {
  requestId: string;
  borrower: string;
  borrowerIdentifier: string;
  membershipStatus: string;
  purpose: string;
  projectName: string;
  period: string;
  lines: ApprovalLine[];
}
export interface HandoverRecord {
  reservationId: string;
  borrower: string;
  borrowerIdentifier: string;
  membershipStatus: string;
  purpose: string;
  itemName: string;
  quantity: number;
  pickupDeadline: string;
}
export interface ReturnRecord {
  loanId: string;
  loanLineId: string;
  borrower: string;
  itemName: string;
  trackingMode: string;
  unresolvedQuantity: number;
  outgoingCondition: string;
  dueAt: string;
}
export interface MemberApplicationRecord {
  applicationId: string;
  applicantName: string;
  studentIdentifier: string;
  department: string;
  studyYear: number;
  institutionalEmail: string;
  state: string;
  submittedAt: string;
  decisionReason: string | null;
}
export interface AccountContext {
  displayName: string;
  initials: string;
  roleLabel: string;
  unreadNotifications: number;
  environmentLabel: string;
}
export interface OwnProfileRecord {
  displayName: string;
  institutionalEmail: string;
  studentIdentifier: string | null;
  department: string | null;
  studyYear: number | null;
  phone: string | null;
  active: boolean;
  membershipStatus: string | null;
  lastAuthenticatedAt: string | null;
  joinedAt: string | null;
  capabilities: string[];
}
export interface PasswordResetRequestRecord {
  id: string;
  institutionalEmail: string;
  requestedAt: string;
  status: string;
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata"
});
const date = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata"
});

async function apiClient() {
  const environment = getServerEnvironment();
  if (environment.demoMode || !environment.supabaseConfigured) return null;
  return createSupabaseServerClient();
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const getAccountContext = cache(
  async (mode: "member" | "staff"): Promise<AccountContext> => {
    const environment = getServerEnvironment();
    const demoName = mode === "staff" ? "Meera Joshi" : "Anaya Kulkarni";
    if (environment.demoMode || !environment.supabaseConfigured)
      return {
        displayName: demoName,
        initials: initialsFor(demoName),
        roleLabel: mode === "staff" ? "Inventory manager" : "Approved member",
        unreadNotifications: 2,
        environmentLabel: "Demo data"
      };

    const client = await createSupabaseServerClient();
    if (!client)
      return {
        displayName: "R.O.F.I.E.S member",
        initials: "RM",
        roleLabel: "Signed-in account",
        unreadNotifications: 0,
        environmentLabel: environment.ROFIES_ENVIRONMENT
      };
    const { data: userData } = await client.auth.getUser();
    const userId = userData.user?.id;
    if (!userId)
      return {
        displayName: "Signed-out",
        initials: "SO",
        roleLabel: "Authentication required",
        unreadNotifications: 0,
        environmentLabel: environment.ROFIES_ENVIRONMENT
      };

    const [{ data: profile }, { count }, { data: roles }, { data: status }] = await Promise.all([
      client.from("profiles").select("display_name,active").eq("id", userId).maybeSingle(),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null)
        .is("archived_at", null),
      client
        .from("role_assignments")
        .select("capability")
        .eq("profile_id", userId)
        .is("revoked_at", null),
      client.schema("api").rpc("member_application_status")
    ]);
    const displayName = String(
      profile?.display_name ?? userData.user?.email ?? "R.O.F.I.E.S member"
    );
    const capabilities = new Set((roles ?? []).map((role) => String(role.capability)));
    const applicationState =
      status && typeof status === "object" && "state" in status ? String(status.state) : null;
    let roleLabel = "Applicant";
    if (mode === "staff" || capabilities.size) {
      if (capabilities.has("system:manage")) roleLabel = "System administrator";
      else if (capabilities.has("inventory:manage")) roleLabel = "Inventory manager";
      else if (capabilities.has("request:approve")) roleLabel = "Request approver";
      else roleLabel = "Staff operator";
    } else if (profile?.active) roleLabel = "Approved member";
    else if (applicationState === "pending_review") roleLabel = "Pending review";
    else if (applicationState === "changes_requested") roleLabel = "Changes requested";

    return {
      displayName,
      initials: initialsFor(displayName) || "RM",
      roleLabel,
      unreadNotifications: count ?? 0,
      environmentLabel: environment.ROFIES_ENVIRONMENT
    };
  }
);

export const getOwnProfile = cache(async (): Promise<OwnProfileRecord | null> => {
  const environment = getServerEnvironment();
  if (environment.demoMode || !environment.supabaseConfigured)
    return {
      displayName: "Anaya Kulkarni",
      institutionalEmail: "anaya.kulkarni@iiitp.ac.in",
      studentIdentifier: "FIC-2401",
      department: "ECE",
      studyYear: 3,
      phone: "+91 90000 00001",
      active: true,
      membershipStatus: "active",
      lastAuthenticatedAt: dateTime.format(new Date()),
      joinedAt: "8 Aug, 10:00",
      capabilities: []
    };

  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const [{ data: profile, error: profileError }, { data: membership }, { data: roles }] =
    await Promise.all([
      client
        .from("profiles")
        .select(
          "display_name,institutional_email,student_identifier,department,study_year,phone,active,last_authenticated_at,created_at"
        )
        .eq("id", userId)
        .maybeSingle(),
      client
        .from("memberships")
        .select("status,approved_at")
        .eq("profile_id", userId)
        .maybeSingle(),
      client
        .from("role_assignments")
        .select("capability")
        .eq("profile_id", userId)
        .is("revoked_at", null)
        .order("capability")
    ]);
  if (profileError || !profile) return null;

  return {
    displayName: String(profile.display_name),
    institutionalEmail: String(profile.institutional_email),
    studentIdentifier:
      typeof profile.student_identifier === "string" ? profile.student_identifier : null,
    department: typeof profile.department === "string" ? profile.department : null,
    studyYear: typeof profile.study_year === "number" ? profile.study_year : null,
    phone: typeof profile.phone === "string" ? profile.phone : null,
    active: Boolean(profile.active),
    membershipStatus:
      membership && typeof membership.status === "string" ? membership.status : null,
    lastAuthenticatedAt: profile.last_authenticated_at
      ? dateTime.format(new Date(String(profile.last_authenticated_at)))
      : null,
    joinedAt: membership?.approved_at
      ? dateTime.format(new Date(String(membership.approved_at)))
      : dateTime.format(new Date(String(profile.created_at))),
    capabilities: (roles ?? []).map((role) => String(role.capability))
  };
});

export const getApprovalWorkbench = cache(async (): Promise<ApprovalRecord[]> => {
  const client = await apiClient();
  if (!client)
    return demoApprovalQueue.map((record, index) => ({
      requestId: index === 0 ? "00000000-0000-0000-0000-000000000401" : `demo-${index}`,
      borrower: record.borrower,
      borrowerIdentifier: "FIC-2401",
      membershipStatus: "active",
      purpose: record.purpose,
      projectName: record.purpose,
      period: record.period,
      lines:
        index === 0
          ? [
              {
                lineId: "00000000-0000-0000-0000-000000000411",
                itemName: "Arduino Mega 2560",
                requestedQuantity: 2,
                availableQuantity: 6
              }
            ]
          : []
    }));
  const { data, error } = await client.schema("api").rpc("approval_queue", { result_limit: 50 });
  if (error) throw new Error(`Approval queue failed: ${error.code}`);
  const records = new Map<string, ApprovalRecord>();
  for (const row of data as Record<string, unknown>[]) {
    const requestId = String(row.request_id);
    const current = records.get(requestId) ?? {
      requestId,
      borrower: String(row.borrower_name),
      borrowerIdentifier: String(row.borrower_identifier ?? "Institution identity"),
      membershipStatus: String(row.membership_status),
      purpose: String(row.purpose),
      projectName: String(row.project_name ?? ""),
      period: `${date.format(new Date(String(row.requested_start)))}–${date.format(new Date(String(row.requested_end)))}`,
      lines: []
    };
    current.lines.push({
      lineId: String(row.line_id),
      itemName: String(row.item_name),
      requestedQuantity: Number(row.requested_quantity),
      availableQuantity: Math.max(0, Number(row.usable_quantity) - Number(row.allocated_quantity))
    });
    records.set(requestId, current);
  }
  return [...records.values()];
});

export const getHandoverQueue = cache(async (): Promise<HandoverRecord[]> => {
  const client = await apiClient();
  if (!client)
    return [
      {
        reservationId: "00000000-0000-0000-0000-000000000501",
        borrower: "Anaya Kulkarni",
        borrowerIdentifier: "FIC-2401 · ECE",
        membershipStatus: "active",
        purpose: "Autonomy Sprint",
        itemName: "Arduino Mega 2560",
        quantity: 2,
        pickupDeadline: "Today, 18:00"
      }
    ];
  const { data, error } = await client.schema("api").rpc("handover_queue", { result_limit: 50 });
  if (error) throw new Error(`Handover queue failed: ${error.code}`);
  return (data as Record<string, unknown>[]).map((row) => ({
    reservationId: String(row.reservation_id),
    borrower: String(row.borrower_name),
    borrowerIdentifier: String(row.borrower_identifier ?? "Institution identity"),
    membershipStatus: String(row.membership_status),
    purpose: String(row.purpose),
    itemName: String(row.item_name),
    quantity: Number(row.remaining_quantity),
    pickupDeadline: dateTime.format(new Date(String(row.pickup_deadline)))
  }));
});

export const getReturnQueue = cache(async (): Promise<ReturnRecord[]> => {
  const client = await apiClient();
  if (!client)
    return [
      {
        loanId: "00000000-0000-0000-0000-000000000601",
        loanLineId: "00000000-0000-0000-0000-000000000611",
        borrower: "Anaya Kulkarni",
        itemName: "Dynamixel XL430-W250",
        trackingMode: "pooled reusable",
        unresolvedQuantity: 4,
        outgoingCondition: "perfect",
        dueAt: "12 Aug, 18:00"
      }
    ];
  const { data, error } = await client.schema("api").rpc("return_queue", { result_limit: 50 });
  if (error) throw new Error(`Return queue failed: ${error.code}`);
  return (data as Record<string, unknown>[]).map((row) => ({
    loanId: String(row.loan_id),
    loanLineId: String(row.loan_line_id),
    borrower: String(row.borrower_name),
    itemName: String(row.item_name),
    trackingMode: String(row.tracking_mode).replaceAll("_", " "),
    unresolvedQuantity: Number(row.unresolved_quantity),
    outgoingCondition: String(row.outgoing_condition).replaceAll("_", " "),
    dueAt: row.due_at ? dateTime.format(new Date(String(row.due_at))) : "No return due"
  }));
});

export const getMemberApplicationQueue = cache(async (): Promise<MemberApplicationRecord[]> => {
  const client = await apiClient();
  if (!client)
    return [
      {
        applicationId: "00000000-0000-0000-0000-000000000103",
        applicantName: "Rhea Nair",
        studentIdentifier: "FIC-2403",
        department: "CSE",
        studyYear: 1,
        institutionalEmail: "rhea.nair@iiitp.ac.in",
        state: "pending_review",
        submittedAt: "Today, 16:10",
        decisionReason: null
      }
    ];
  const { data, error } = await client
    .from("member_applications")
    .select(
      "id,state,submitted_at,decision_reason,profiles!member_applications_profile_id_fkey(display_name,student_identifier,department,study_year,institutional_email)"
    )
    .eq("state", "pending_review")
    .order("submitted_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`Member application queue failed: ${error.code}`);
  return (data as Record<string, unknown>[]).map((row) => {
    const profile = row.profiles as Record<string, unknown> | null;
    return {
      applicationId: String(row.id),
      applicantName: String(profile?.display_name ?? "Applicant"),
      studentIdentifier: String(profile?.student_identifier ?? "Institution identity"),
      department: String(profile?.department ?? "Department pending"),
      studyYear: Number(profile?.study_year ?? 0),
      institutionalEmail: String(profile?.institutional_email ?? "institutional email"),
      state: String(row.state),
      submittedAt: row.submitted_at ? dateTime.format(new Date(String(row.submitted_at))) : "Draft",
      decisionReason: typeof row.decision_reason === "string" ? row.decision_reason : null
    };
  });
});

type ActivityRecord = { time: string; action: string; detail: string; actor: string };
export const getStaffDashboard = cache(
  async (): Promise<{
    summary: OperationalSummary;
    approvals: ApprovalRecord[];
    passwordResetRequests: PasswordResetRequestRecord[];
    activity: readonly ActivityRecord[];
  }> => {
    const client = await apiClient();
    if (!client)
      return {
        summary: demoSummary,
        approvals: await getApprovalWorkbench(),
        passwordResetRequests: [
          {
            id: "00000000-0000-0000-0000-000000000701",
            institutionalEmail: "student@iiitp.ac.in",
            requestedAt: "12 min ago",
            status: "pending"
          }
        ],
        activity: demoActivity
      };
    const [{ data, error }, approvals, passwordResetRequests, audit] = await Promise.all([
      client.schema("api").rpc("staff_dashboard"),
      getApprovalWorkbench(),
      getManualPasswordResetQueue(),
      client
        .from("audit_events")
        .select("action,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(8)
    ]);
    if (error || !data?.[0]) throw new Error(`Staff dashboard failed: ${error?.code ?? "empty"}`);
    const row = data[0] as Record<string, unknown>;
    return {
      summary: {
        pendingRequests: Number(row.pending_requests),
        pendingMemberApplications: Number(row.pending_member_applications),
        readyPickups: Number(row.ready_pickups),
        overdueLoans: Number(row.overdue_loans),
        repairQueue: Number(row.repair_queue),
        retentionFailures: 0,
        pendingPasswordResetRequests: passwordResetRequests.length
      },
      approvals,
      passwordResetRequests,
      activity: (audit.data ?? []).map((event) => ({
        time: dateTime.format(new Date(event.created_at)),
        action: String(event.action).replaceAll(".", " "),
        detail: String(event.reason ?? "Committed business event"),
        actor: "authorized operator"
      }))
    };
  }
);

export const getManualPasswordResetQueue = cache(
  async (): Promise<PasswordResetRequestRecord[]> => {
    const client = await apiClient();
    if (!client)
      return [
        {
          id: "00000000-0000-0000-0000-000000000701",
          institutionalEmail: "student@iiitp.ac.in",
          requestedAt: "12 min ago",
          status: "pending"
        }
      ];
    const { data, error } = await client
      .from("password_reset_requests")
      .select("id,institutional_email,requested_at,status")
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(50);
    if (error) return [];
    return data.map((row) => ({
      id: String(row.id),
      institutionalEmail: String(row.institutional_email),
      requestedAt: dateTime.format(new Date(row.requested_at)),
      status: String(row.status).replaceAll("_", " ")
    }));
  }
);

export const getMyActivity = cache(async () => {
  const client = await apiClient();
  if (!client)
    return demoMemberRequests.map((record) => ({
      id: record.id,
      title: record.title,
      status: record.status,
      detail: record.detail,
      updated: record.updated
    }));
  const { data, error } = await client
    .from("requests")
    .select("id,status,purpose,project_name,requested_start,requested_end,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Member activity failed: ${error.code}`);
  return data.map((row) => ({
    id: String(row.id).slice(0, 8).toUpperCase(),
    title: String(row.project_name ?? row.purpose),
    status: String(row.status).replaceAll("_", " "),
    detail: `${date.format(new Date(row.requested_start))}–${date.format(new Date(row.requested_end))}`,
    updated: dateTime.format(new Date(row.updated_at))
  }));
});

export const getMyNotifications = cache(async () => {
  const client = await apiClient();
  if (!client)
    return [
      {
        id: "demo-1",
        title: "Jetson Orin Nano is ready for pickup",
        body: "Collect it from the Robotics Lab by today at 18:00.",
        createdAt: "12 min ago",
        unread: true
      },
      {
        id: "demo-2",
        title: "Request is under review",
        body: "Autonomy Sprint has entered the approval queue.",
        createdAt: "35 min ago",
        unread: true
      }
    ];
  const { data, error } = await client
    .from("notifications")
    .select("id,title,body,created_at,read_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Notifications failed: ${error.code}`);
  return data.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    createdAt: dateTime.format(new Date(row.created_at)),
    unread: !row.read_at
  }));
});

export const getVisibleContacts = cache(async () => {
  const client = await apiClient();
  if (!client)
    return [
      {
        id: "demo-equipment",
        name: "Meera Joshi",
        responsibility: "Equipment handover and returns",
        institutional_email: "meera.joshi@iiitp.ac.in",
        phone: "+91 90000 00005",
        availability: "Mon–Fri, 17:00–19:00",
        contact_type: "equipment"
      },
      {
        id: "demo-lead",
        name: "Vivaan Iyer",
        responsibility: "Request approvals",
        institutional_email: "vivaan.iyer@iiitp.ac.in",
        phone: null,
        availability: "Weekdays after 17:00",
        contact_type: "club_leadership"
      },
      {
        id: "demo-support",
        name: "R.O.F.I.E.S Systems",
        responsibility: "Access and application support",
        institutional_email: "rofies-support@iiitp.ac.in",
        phone: null,
        availability: "Reply within two club days",
        contact_type: "app_support"
      }
    ];
  const { data, error } = await client
    .from("contacts")
    .select("id,name,responsibility,institutional_email,phone,availability,contact_type")
    .order("sort_order")
    .limit(50);
  if (error) throw new Error(`Contacts failed: ${error.code}`);
  return data;
});

export const getSystemHealth = cache(async () => {
  const client = await apiClient();
  if (!client)
    return {
      checkedAt: new Date().toISOString(),
      unreadNotifications: 3,
      archivableNotifications: 1,
      archivedNotificationLagSeconds: 86_400,
      retentionFailures: 0,
      oldestOverdueIdDeletionSeconds: 0,
      deletionFailures24h: 0,
      lastSuccessfulCleanupAt: new Date().toISOString(),
      unresolvedReconciliations: 1,
      overdueLines: 1,
      criticalNoticeActive: false,
      demo: true
    };
  const { data, error } = await client
    .schema("api")
    .from("system_health")
    .select(
      "checked_at,unread_notifications,archivable_notifications,archived_notification_lag_seconds,retention_failures,oldest_overdue_id_deletion_seconds,deletion_failures_24h,last_successful_cleanup_at,unresolved_reconciliations,overdue_lines,critical_notice_active"
    )
    .maybeSingle();
  if (error || !data) return null;
  return {
    checkedAt: String(data.checked_at),
    unreadNotifications: Number(data.unread_notifications),
    archivableNotifications: Number(data.archivable_notifications),
    archivedNotificationLagSeconds: Number(data.archived_notification_lag_seconds ?? 0),
    retentionFailures: Number(data.retention_failures),
    oldestOverdueIdDeletionSeconds: Number(data.oldest_overdue_id_deletion_seconds ?? 0),
    deletionFailures24h: Number(data.deletion_failures_24h),
    lastSuccessfulCleanupAt: data.last_successful_cleanup_at
      ? String(data.last_successful_cleanup_at)
      : null,
    unresolvedReconciliations: Number(data.unresolved_reconciliations),
    overdueLines: Number(data.overdue_lines),
    criticalNoticeActive: Boolean(data.critical_notice_active),
    demo: false
  };
});
