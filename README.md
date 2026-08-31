# R.O.F.I.E.S Equipment Manager

Responsive equipment discovery, reservation, approval, handover, return, and operations software for the R.O.F.I.E.S robotics community. The application uses Next.js 16, React 19, strict TypeScript, and Supabase PostgreSQL/Auth/Storage.

> **Implementation status:** the 2026-08-08 institutional email/password, private college-ID verification, and in-app-only notification redesign is implemented locally and reverified. Do not treat this as production-ready until institution-owned Supabase/Vercel/SMTP/storage/alerting configuration, retention scheduling, post-deploy smoke checks, and explicit deployment approval are complete.

## Prerequisites

- Node.js 24 (Next.js requires Node.js 20.9 or newer)
- pnpm 11.10
- Docker Desktop for local Supabase and database tests

## Start locally

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

The checked-in default is a fictional demo experience and never contacts a production service. For connected local behavior, run `pnpm db:start`, copy the local URL, publishable key, and service-role key reported by `pnpm exec supabase status` into `.env.local`, and set `ROFIES_DEMO_MODE=false`. Never reuse local, preview, or production credentials across environments.

The local database is recreated and seeded with fictional identities and inventory using:

```powershell
pnpm db:reset
pnpm test:db
```

## Quality commands

The principal commands are `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:authz`, `pnpm test:concurrency`, `pnpm test:e2e`, `pnpm test:a11y`, `pnpm build`, `pnpm audit --prod`, `pnpm scan:secrets`, `pnpm test:performance`, `pnpm backup:exercise`, and `pnpm reconcile:exercise`.

No production deployment is configured by this repository. Vercel, Supabase, institution-owned SMTP for Supabase Auth confirmation/recovery mail, scheduled `POST /api/jobs/retention`, automated backups, alerts, and production domains require institution-owned projects and secrets. Application events are in-app only; no application-email provider is part of the approved design. Follow [docs/PRODUCTION_RELEASE.md](docs/PRODUCTION_RELEASE.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/VERIFICATION_REPORT.md](docs/VERIFICATION_REPORT.md) before a pilot.
