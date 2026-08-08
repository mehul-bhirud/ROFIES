# ADR 0001: Server-Mediated Supabase Architecture

**Status:** Superseded in part by ADR 0003  
**Date:** 2026-08-07

## Context

ADR 0003 replaces the Google Workspace OAuth and application-email/outbox portions of this decision. The remaining server-mediated Next.js, Vercel, PostgreSQL, Supabase Storage, transaction, and RLS choices remain accepted.

R.O.F.I.E.S needs a responsive inventory and borrowing application for 1,000–2,000 students, 200–300 approved members, 1,000–2,000 inventory units, and 5–15 staff users. It requires institutional Google authentication, relational transactions, RLS, photographs, migrations, Vercel hosting, auditability, and reliable reservation/stock logic.

The team prefers a simple operational footprint without weakening business-rule enforcement.

## Decision

Use:

- Next.js with TypeScript for the responsive full-stack application.
- Vercel for application hosting.
- Supabase PostgreSQL as the authoritative relational database.
- Supabase Auth with Google Workspace.
- Supabase Storage for equipment photographs.
- Server-side command functions for privileged mutations.
- PostgreSQL transactions, constraints, locks, grants, and RLS for integrity and defense in depth.
- A transactional outbox for in-app and email notifications.

The browser may perform safe reads through application endpoints but may not directly perform privileged inventory mutations. Service-role credentials remain server-only.

## Rationale

- One managed platform covers database, authentication, storage, migrations, and RLS.
- PostgreSQL transactions fit reservation, stock, and append-only audit requirements.
- Server-mediated commands make complex authorization and exceptional-state behavior easier to test and review.
- RLS reduces the impact of an application-layer access-control mistake.
- The expected scale is well within a single relational application and does not justify microservices or a separate search engine.

## Alternatives considered

### Modular managed services

Next.js/Vercel with separate Postgres, authentication, and object-storage providers offers greater vendor independence but increases integration, authorization, secret, deployment, and maintenance work without a current scale benefit.

### Client-heavy Supabase

Direct browser-to-database operations reduce backend code but make approval, reservation, concurrency, and privileged inventory workflows easier to misconfigure and harder to centralize. It is rejected for protected mutations.

### Dedicated separate API service

A separately hosted API could provide isolation and long-running processing, but adds deployment and operational complexity. It can be reconsidered only if measured runtime constraints or independent scaling needs emerge.

## Consequences

- The application depends materially on Supabase and Vercel capabilities.
- RLS, grants, database functions, and migrations are first-class reviewed code.
- Business commands require careful transaction and idempotency design.
- Environment isolation and service-secret handling are critical.
- Package manager, UI library, query layer, email provider, and error-reporting provider remain implementation-plan decisions and require additional ADRs when selected.

## References

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Vercel Postgres integrations](https://vercel.com/docs/postgres)
