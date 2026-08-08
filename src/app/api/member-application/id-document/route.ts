import { NextRequest, NextResponse } from "next/server";
import { getServerEnvironment } from "@/lib/env/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const applicationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(status = 404) {
  return new NextResponse("Resource unavailable.", {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

export async function GET(request: NextRequest) {
  const environment = getServerEnvironment();
  const applicationId = request.nextUrl.searchParams.get("applicationId");
  if (!applicationId || !applicationIdPattern.test(applicationId)) return unavailable();
  if (environment.demoMode) {
    return new NextResponse(
      `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450" role="img" aria-label="Fictional processed college ID">
        <rect width="720" height="450" fill="#eaf2f3"/>
        <rect x="42" y="42" width="636" height="366" rx="18" fill="#ffffff" stroke="#93aaae" stroke-width="3"/>
        <rect x="72" y="82" width="190" height="190" rx="12" fill="#d9f2f5"/>
        <rect x="292" y="96" width="290" height="24" fill="#102a2e"/>
        <rect x="292" y="148" width="220" height="18" fill="#526b70"/>
        <rect x="292" y="196" width="260" height="18" fill="#526b70"/>
        <rect x="72" y="316" width="430" height="18" fill="#007f95"/>
        <path d="M96 354h528" stroke="#c8d7d9" stroke-width="3" stroke-dasharray="10 12"/>
      </svg>`,
      {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  }

  const client = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();
  if (!client || !service) return unavailable(503);
  const { error: userError } = await client.auth.getUser();
  if (userError) return unavailable();
  const { data: objectName, error } = await client
    .schema("api")
    .rpc("college_id_object", { application_id: applicationId });
  if (error || typeof objectName !== "string") return unavailable();
  const download = await service.storage.from("college-ids").download(objectName);
  if (download.error) return unavailable(503);
  return new NextResponse(download.data, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
