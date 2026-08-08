# ADR 0002: First-Release Implementation Tooling

**Status:** Superseded in part by ADR 0003  
**Date:** 2026-08-08

## Context

ADR 0003 removes the Resend-compatible application-email adapter and replaces Google OAuth with confirmed institutional email/password registration plus admin college-ID verification. The remaining tooling choices stay accepted.

ADR 0001 leaves package management, UI composition, query access, email delivery, and diagnostic telemetry open. The first release needs locally reproducible tests and must remain useful before institution-owned provider credentials are configured.

## Decision

- Use pnpm with a committed lockfile and Node.js 24 in local/CI environments; retain Next.js 16's documented Node.js 20.9 minimum.
- Use Next.js App Router, React Server Components for read-heavy pages, and small client islands only for interaction state.
- Use token-driven CSS and focused in-repository components instead of a broad UI component framework.
- Use Zod for untrusted server input and environment validation.
- Use Supabase SSR/client packages for sessions and safe queries; call narrowly granted PostgreSQL RPC commands for privileged mutations.
- Use a Resend-compatible HTTP email adapter behind the notification outbox. A no-send local adapter records deterministic delivery results.
- Emit structured, redacted diagnostic events compatible with Vercel/OpenTelemetry without making a paid observability vendor a runtime requirement.
- Use Vitest, Testing Library, pgTAP via the Supabase CLI, Playwright, and axe for automated verification.

## Consequences

- The main browser bundle stays small and authorization is not coupled to client state.
- SQL migrations and RPC functions remain first-class, reviewable product code.
- Local demo mode can exercise UI flows without real identities, but it is rejected when `ROFIES_ENVIRONMENT=production`.
- Google OAuth, transactional email, controlled photo URLs, backups, and deployment still require institution-owned provider setup before production use.
