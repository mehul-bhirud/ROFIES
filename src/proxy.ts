import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicApplicationPath } from "@/lib/auth/access";
import {
  applicationDestination,
  parseMemberApplicationStatus
} from "@/lib/auth/application-access";
import { validateInstitutionalEmail } from "@/lib/auth/identity";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const csp = `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; upgrade-insecure-requests`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const secure = (result: NextResponse) => {
    result.headers.set("Content-Security-Policy", csp);
    return result;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const demoMode = process.env.ROFIES_DEMO_MODE !== "false";
  if (!url || !key || demoMode)
    return secure(NextResponse.next({ request: { headers: requestHeaders } }));
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      }
    }
  });
  const { data } = await client.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPageRequest = !pathname.startsWith("/api/");
  if (!data.user && isPageRequest && !isPublicApplicationPath(pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/auth/sign-in";
    signIn.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return secure(NextResponse.redirect(signIn));
  }
  if (data.user && isPageRequest && !isPublicApplicationPath(pathname)) {
    const { data: statusData, error } = await client.schema("api").rpc("member_application_status");
    const status = error ? null : parseMemberApplicationStatus(statusData);
    const allowedDomains = (process.env.ROFIES_ALLOWED_EMAIL_DOMAINS ?? "iiitp.ac.in,ece.iiitp.ac.in,cse.iiitp.ac.in")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);
    const destination = applicationDestination({
      emailConfirmed:
        Boolean(data.user.email_confirmed_at) &&
        validateInstitutionalEmail(data.user.email ?? "", allowedDomains),
      active: status?.membershipStatus === "active",
      applicationState: status?.state ?? null
    });
    const onExpectedSurface =
      destination === "/"
        ? pathname !== "/onboarding" && pathname !== "/pending"
        : destination === pathname;
    if (!onExpectedSurface) {
      const target = request.nextUrl.clone();
      target.pathname = destination;
      target.search = destination === "/auth/error" ? "?code=application_access" : "";
      return secure(NextResponse.redirect(target));
    }
  }
  return secure(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
