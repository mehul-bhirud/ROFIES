# Build R.O.F.I.E.S Equipment Manager End to End

## Mission

Build a production-ready first release of the R.O.F.I.E.S Equipment Manager in this repository. Implement the approved specification completely, test it proportionately to risk, and provide evidence that the application works. Do not stop after scaffolding, mockups, a plan, or a partially connected interface.

Repository of record: `https://github.com/mehul-bhirud/ROFIES`

## Required context

Before planning or changing code, read these files completely in this order:

1. `AGENTS.md`
2. `PROJECT_SPEC.md`
3. `docs/DOMAIN_MODEL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DATA_MODEL.md`
6. `docs/SECURITY.md`
7. `docs/OPERATIONS.md`
8. `docs/TEST_STRATEGY.md`
9. Every accepted record in `docs/adr/`

Treat `PROJECT_SPEC.md` as authoritative for product behavior and `AGENTS.md` as mandatory repository guidance. If the repository code and specification conflict, preserve evidence, explain the conflict, and bring the code into compliance unless doing so would destroy intentional user work. Do not silently weaken requirements.

## Working mode

- Inspect the repository, current branch, history, existing code, configuration, and tests before selecting libraries or file paths.
- Create a detailed implementation plan based on the actual repository and save it to `docs/IMPLEMENTATION_PLAN.md`.
- The plan must map every section of `PROJECT_SPEC.md` to implementation tasks and verification.
- Execute the plan phase by phase. Keep the plan checkboxes/status current as work is completed.
- Use test-driven development for domain rules, authorization, database invariants, and bug fixes.
- Make small, coherent local commits when Git is available. Do not push, open a pull request, deploy production, create paid resources, or rotate real credentials without explicit authorization.
- Do not pause merely because the project is large. Continue through all safe local work. If an external secret or provider setup blocks one path, build and test the remaining system with documented local/test configuration.
- Ask the user only when a missing decision would materially change product behavior, cost, privacy, or external state. Otherwise make a reasonable, documented choice consistent with the specifications.

## Required skills

Use installed skills before the work they govern; read each selected `SKILL.md` fully and follow it.

### UI and frontend

1. Invoke the installed **UI UX Pro Max** skill before defining the visual system or building screens. Its expected callable name is `$ui-ux-pro-max`; if the installation exposes a slightly different name, locate the installed skill by that title and use the actual name.
2. Also use `frontend-design` to establish a distinctive, intentional design direction.
3. Use `vercel-react-best-practices` while designing and implementing React/Next.js components and data flow.
4. Use `playwright-best-practices` before writing or debugging Playwright end-to-end tests.

If UI UX Pro Max is unavailable in the active Codex environment, state that once, use `frontend-design` as the fallback, and continue. Do not silently pretend the skill ran.

### Data, quality, and security

- Use `supabase-postgres-best-practices` before creating or changing PostgreSQL schema, indexes, queries, functions, grants, or RLS policies.
- Use `superpowers:test-driven-development` for feature and bug-fix implementation.
- Use `code-review-and-quality` before declaring the implementation ready.
- Use `superpowers:verification-before-completion` before any completion claim.
- Use the applicable Codex Security skills to threat-model the implementation, review security-sensitive diffs, run a standard repository security scan, validate findings, and fix confirmed issues.
- Use a deep security scan only at the release-hardening gate or when the user explicitly authorizes its expected cost/runtime. Do not substitute scanner output for manual validation.

Do not invoke skills as decoration. Apply their requirements to the produced code, tests, and documentation.

## Product and visual direction

The interface must feel sleek, modern, calm, and technically credible for a robotics community—not like a generic admin template or a playful consumer app.

- Design desktop and mobile together. Admin handover and return workflows must be comfortable on a phone.
- Create and document a small design system in `docs/UI_SYSTEM.md`: typography, color roles, spacing, radius, elevation, icons, status treatment, responsive rules, component states, and accessibility rules.
- Prefer a focused neutral foundation with a deliberate robotics/engineering accent. Avoid excessive gradients, glass effects, decorative motion, huge marketing typography, and dashboard clutter.
- Use dense information only where it improves staff operations. Member screens should remain simple and reassuring.
- Status must always include text and may not rely on color alone.
- Include polished empty, loading, validation, conflict, permission-denied, stale-data, offline/degraded, and unexpected-error states.
- Meet WCAG 2.2 AA expectations for contrast, keyboard use, focus, labels, semantics, and motion preferences.
- Use realistic seeded equipment and workflow data; do not leave lorem ipsum or meaningless placeholder cards in production paths.

Before scaling implementation, build the core visual primitives and one representative member flow plus one admin flow. Inspect them at mobile and desktop widths, correct the design system, then reuse those primitives consistently.

## Approved technical direction

- Responsive Next.js and TypeScript application deployed on Vercel.
- Supabase PostgreSQL as the authoritative database.
- Supabase Auth with institutional email/password registration, email confirmation, and server-side institution-domain enforcement.
- Institution-owned SMTP is used only by Supabase Auth for confirmation, password reset, and security emails.
- Supabase Storage for controlled equipment photographs and a separate private college-ID bucket.
- A student applicant completes a profile and uploads a college-ID image; an authorized admin must verify the application before membership is activated.
- Server-mediated privileged mutations.
- PostgreSQL constraints, transactions, deterministic locks, grants, and RLS as defense in depth.
- Application notifications are in-app only and are written transactionally and idempotently with the related business action.
- Structured logs, metrics, traces, audit events, health views, backup/recovery documentation, and outage reconciliation.

Respect an established compatible repository stack when present. Record any new major dependency or architectural choice in an ADR. Never expose server secrets or service-role credentials to the browser.

## Execution phases and gates

### Phase 1: Repository and engineering foundation

- Map the existing repository and preserve intentional work.
- Select/document compatible tooling, versions, package manager, UI stack, query layer, and observability/error provider. Do not add an application-email adapter.
- Add strict TypeScript, formatting/linting, environment validation, `.env.example`, CI, and documented local commands.
- Establish isolated local/test/preview/production configuration.
- Implement test harnesses and realistic fictional seed data.

Gate: dependency installation, lint, type-check, base tests, and production build succeed from documented commands.

### Phase 2: Design system and application shell

- Use the required UI/frontend skills.
- Implement responsive navigation, layout, typography, tokens, forms, tables/lists, cards, dialogs, calendars/statuses, notifications, error states, and accessibility primitives.
- Implement representative catalog/member and admin-operation screens against seeded/test data.
- Document the system in `docs/UI_SYSTEM.md`.

Gate: visual review at representative mobile/desktop widths, keyboard traversal, automated accessibility scan, and no generic placeholders.

### Phase 3: Registration, identity verification, authorization, and database foundation

- Remove the Google OAuth path and implement institutional email/password signup, email confirmation, login, password recovery, and server-side domain enforcement.
- Implement applicant profiles, private college-ID upload, `pending_review`/`changes_requested`/`rejected`/`approved` review states, audited document access, automatic 30-day document deletion after a final decision, and atomic “verify and activate member”.
- Implement composable roles, recent-auth checks, account deactivation, and deny-by-default authorization. Confirmed email alone must not grant catalog or borrowing access.
- Create versioned schema migrations, grants, RLS, audit foundation, idempotency support, policies, and seed data.
- Test every role and cross-user denial at the server and database layers.

Gate: clean database reset/migration passes; registration/application state machines, private-ID storage policies, retention cleanup, authentication/domain, and permission matrices pass; no browser bundle contains privileged secrets or private object URLs.

### Phase 4: Catalog and inventory

- Implement categories, pooled reusable/individual/consumable modes, photos, tags, aliases, key/value specifications, public/internal remarks, condition quantities, locations, policies, low-stock thresholds, adjustments, repair state, and archive behavior.
- Implement PostgreSQL search and date-aware availability views without borrower disclosure.
- Build member catalog and staff inventory experiences.

Gate: inventory constraints, RLS, upload processing, search/query performance, accessibility, and responsive flows pass.

### Phase 5: Requests, reservations, and waitlists

- Implement request cart, one borrower of record, project/team context, per-line partial approval, change/reject reasons, future reservation capacity, pickup windows, expiry/cancellation, waitlist ordering, claim windows, and audited overrides.
- Use atomic transaction-time availability checks and concurrency protection.

Gate: simultaneous approvals cannot overbook; pending requests do not block stock; approved reservations do; users cannot self-approve or see other borrowers.

### Phase 6: Handover, loans, returns, and maintenance

- Implement phone-friendly physical handover, counter issue, active loans, due/overdue behavior, extension decisions, partial returns, mixed incoming condition, repair routing, loss/write-off, and emergency reconciliation.
- Ensure all state changes are atomic, idempotent, and audited.

Gate: complete pooled/individual/consumable journeys pass end to end; retries create no duplicate loan/return; stock never becomes negative.

### Phase 7: Notifications and administration

- Remove Resend, the application-email adapter/worker, and application-email delivery tables and configuration.
- Implement direct transactional, idempotent in-app notifications, unread/read behavior, 180-day archival of read notifications, member notifications, contacts, configurable policies, operational dashboard, reports, safe CSV export, audit browser, health view, maintenance mode, and system notices.

Gate: business actions and their in-app notifications commit or roll back together; duplicate retries create no duplicate notification; archival, formula-injection-safe exports, and privileged access tests pass; jobs are observable and retry safely.

### Phase 8: Hardening, operations, and release candidate

- Complete OWASP 2025 controls, security headers/CSP, CSRF/origin protections, rate limits, upload/export hardening, secret scanning, dependency checks, and privacy review.
- Add traces and operational metrics/alerts for critical flows.
- Exercise backup restore and outage reconciliation in an isolated environment.
- Run performance tests using the scale in `PROJECT_SPEC.md`.
- Run code review, standard security scan, validate/fix findings, and run the authorized release-level deep scan if available.

Gate: all release gates in `docs/TEST_STRATEGY.md` and acceptance criteria in `PROJECT_SPEC.md` pass.

## Required verification evidence

Before claiming completion, run and report the exact commands and outcomes for:

- Dependency installation reproducibility.
- Formatting/linting.
- Type checking.
- Unit tests.
- Database migration/reset tests.
- Database constraints and RLS tests.
- Integration tests.
- Authorization/privacy matrix.
- Concurrency tests.
- Playwright end-to-end tests at mobile and desktop sizes.
- Accessibility checks.
- Production build.
- Dependency and secret scans.
- Security review/scan and finding validation.
- Representative query plans or performance tests.
- Backup/restore and emergency reconciliation exercise.

Do not say “all tests pass” without current command output. Do not hide skipped tests. If a check cannot run because an external credential is intentionally absent, identify the exact missing credential, provide the safe setup step, and show the local substitute/mocked verification that did run.

## Required deliverables

- Complete working application code.
- Versioned Supabase schema, migrations, RLS, functions, storage policies, and fictional seed data.
- Responsive, accessible member and staff interfaces.
- Local setup and environment documentation with `.env.example` containing no real secret.
- CI configuration and documented quality commands.
- Automated unit, database, integration, authorization, concurrency, accessibility, and E2E tests.
- `docs/IMPLEMENTATION_PLAN.md` with completed status.
- `docs/UI_SYSTEM.md`.
- Updated architecture/data/security/operations/testing documents and any new ADRs.
- Final verification report in `docs/VERIFICATION_REPORT.md` containing commands, outcomes, limitations, and remaining external setup.

## Completion condition

The task is complete only when the application satisfies the specification, all safe local implementation work is finished, required verification passes, documentation matches reality, and remaining work—if any—requires user-owned credentials, external provider configuration, deployment authorization, or an explicitly accepted risk.

At handoff, summarize what was built, provide the verification evidence, list external setup steps, and identify any intentionally deferred item. Do not deploy or push without permission.
