import "server-only";
import { z } from "zod";

const environmentSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(16).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(16).optional(),
    ROFIES_ALLOWED_EMAIL_DOMAINS: z.string().default("iiitp.ac.in,ece.iiitp.ac.in,cse.iiitp.ac.in"),
    ROFIES_APP_ORIGIN: z.string().optional(),
    ROFIES_ENVIRONMENT: z.enum(["local", "test", "preview", "production"]).default("local"),
    ROFIES_DEMO_MODE: z.enum(["true", "false"]).default("true"),
    ROFIES_MAINTENANCE_MODE: z.enum(["true", "false"]).default("false"),
    CRON_SECRET: z.string().min(16).optional()
  })
  .superRefine((value, context) => {
    let appOrigin: URL | null = null;
    if (value.ROFIES_APP_ORIGIN) {
      try {
        appOrigin = new URL(value.ROFIES_APP_ORIGIN);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["ROFIES_APP_ORIGIN"],
          message: "ROFIES_APP_ORIGIN must be a valid HTTP(S) origin"
        });
      }
      if (appOrigin && !["http:", "https:"].includes(appOrigin.protocol)) {
        context.addIssue({
          code: "custom",
          path: ["ROFIES_APP_ORIGIN"],
          message: "ROFIES_APP_ORIGIN must be an HTTP(S) origin"
        });
      }
      if (
        appOrigin &&
        (appOrigin.username ||
          appOrigin.password ||
          appOrigin.pathname !== "/" ||
          appOrigin.search ||
          appOrigin.hash)
      ) {
        context.addIssue({
          code: "custom",
          path: ["ROFIES_APP_ORIGIN"],
          message: "ROFIES_APP_ORIGIN must not contain credentials, path, query, or fragment"
        });
      }
    } else if (value.ROFIES_ENVIRONMENT !== "local" && value.ROFIES_ENVIRONMENT !== "test") {
      context.addIssue({
        code: "custom",
        path: ["ROFIES_APP_ORIGIN"],
        message: "ROFIES_APP_ORIGIN is required outside local and test environments"
      });
    }

    if (value.ROFIES_ENVIRONMENT === "production") {
      if (appOrigin?.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["ROFIES_APP_ORIGIN"],
          message: "ROFIES_APP_ORIGIN must use HTTPS in production"
        });
      }
      if (value.ROFIES_DEMO_MODE === "true") {
        context.addIssue({ code: "custom", message: "Demo mode is forbidden in production" });
      }
      for (const key of [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "CRON_SECRET"
      ] as const) {
        if (!value[key])
          context.addIssue({ code: "custom", message: `${key} is required in production` });
      }
    }
  });

export type ServerEnvironment = ReturnType<typeof getServerEnvironment>;

export function parseServerEnvironment(source: Record<string, string | undefined>) {
  const value = environmentSchema.parse(source);
  const appOrigin = value.ROFIES_APP_ORIGIN
    ? new URL(value.ROFIES_APP_ORIGIN).origin
    : "http://localhost:3000";
  return {
    ...value,
    ROFIES_APP_ORIGIN: appOrigin,
    demoMode: value.ROFIES_DEMO_MODE === "true",
    maintenanceMode: value.ROFIES_MAINTENANCE_MODE === "true",
    allowedEmailDomains: value.ROFIES_ALLOWED_EMAIL_DOMAINS.split(",")
      .map((domain) => domain.trim())
      .filter(Boolean),
    supabaseConfigured: Boolean(
      value.NEXT_PUBLIC_SUPABASE_URL && value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  };
}

export function getServerEnvironment() {
  return parseServerEnvironment(process.env);
}
