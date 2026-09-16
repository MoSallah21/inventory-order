# AI Worklog

## 2026-09-16 — Foundation

- Inspected the initially empty workspace and local toolchain.
- Verified current Next.js, Prisma, Better Auth, and Vercel-compatible package lines.
- Scaffolded Next.js through a temporary npm-safe child name because the repository folder contains spaces and `&`.
- Moved the scaffold to the repository root and repaired pnpm's generated virtual-store links.
- Read the generated Next.js agent instructions and relevant bundled App Router authentication/routing guidance.
- Pinned dependencies and enabled only required dependency lifecycle scripts.
- Added environment, Prisma, Better Auth, authorization, error, money, seed, pages, tests, migration, and documentation.
- Ran Prisma offline/static validation and compared its generated SQL structure to the checked-in migration.
- Confirmed typecheck, lint, and targeted tests pass before the final documentation/build run.
- Confirmed formatting, final Prisma validation/generation, typecheck, all 11 tests, lint, and production build pass.
- Attempted migration deployment and seed; both were honestly blocked by invalid example credentials at the reachable
  local PostgreSQL endpoint.
- Reviewed the complete tracked-file inventory and scanned for secrets, unsafe casts, suppressions, TODOs, and junk.

No category UI, product CRUD, uploads, cart, checkout, order workflow, dashboard, or optional feature was implemented.

## 2026-09-16 — Part A continuation

- Re-audited `.gitignore`, initialized the local Git repository, and confirmed core generated/secret paths are ignored.
- Added missing ignore rules for upload, test-result, report, and log artifacts.
- Added a PostgreSQL-only Compose definition and an ignored local `.env` aligned with `.env.example`.
- Confirmed Docker is neither on `PATH` nor installed at the standard Docker Desktop executable locations.
- Kept Part B closed because the database and authentication runtime gates cannot yet run.

## 2026-09-16 — Live foundation and catalog

- Reverified the Git baseline, healthy PostgreSQL service, applied migration, deterministic seed counts, custom checks,
  enum values, and core foreign-key relations.
- Exercised Better Auth credential sign-in and protected pages for admin, supplier, and customer roles without exposing
  credentials or cookies. Verified anonymous, cross-role, and temporarily disabled-user rejection.
- Added a PostgreSQL-backed negative-stock check and catalog integration suite with exact-ID cleanup.
- Added authoritative category and supplier-product services with typed validation/errors and actor-derived ownership.
- Added admin category pages, supplier product pages, and safe public catalog list/detail pages.
- Chose validated HTTPS image URLs as the temporary boundary; no upload UI was added.

## 2026-09-16 — Pre-commit audit fixes

- Replaced eager stock-number coercion with a reusable canonical decimal parser at the raw `FormData` boundary.
- Added focused parser coverage for missing, file, whitespace, signs, alternate bases, non-integers, unsafe values, and
  bounds.
- Serialized product create/update and category archival with parameterized row locks and interactive transactions.
- Added deterministic PostgreSQL concurrency tests that observe actual lock waits through database metadata.
- Added affected-boundary coverage for invalid image URLs, repeat archival, disabled mutation actors, cross-supplier
  transactional denial, and rollback/no-partial-write behavior.

## 2026-09-16 — Transactional order phase

- Confirmed the applied schema supports grouped checkout, durable idempotency, snapshots, and unique movements without
  a migration.
- Added strict order parsing, atomic placement, deterministic locks, `BigInt` totals, and conditional stock decrement.
- Added role-aware transitions, exactly-once cancellation restoration, safe order DTOs, and the minimal cart/order UI.
- Added unit and PostgreSQL integration coverage for validation, rollback, idempotency, ownership, transitions,
  cancellation, and exact-PID stock concurrency.

## 2026-09-16 — Confirmed order-flow audit corrections

- Grouped cart totals by database currency without conversion and kept checkout payloads price/currency-free.
- Added signed PostgreSQL `BIGINT` multiplication and accumulation validation with safe typed errors.
- Reworked Product and Order lock probes around `FOR KEY SHARE` barriers so only the production locking `SELECT` can
  satisfy the exact-PID assertion; added bounded barrier acquisition and cleanup settlement.
- Added focused idempotency, cancellation, actor reload, archived-product, strict FormData/action, recursive DTO, cart,
  currency-authority, and overflow rollback coverage without changing the schema or migration.

## 2026-09-16 — Admin dashboard

- Confirmed a clean synchronized baseline, healthy PostgreSQL, and sufficient unchanged schema before implementation.
- Added a database-authoritative admin aggregate service with explicit safe DTOs and parameterized PostgreSQL queries.
- Added low-stock filtering at 10 units, seven UTC activity days with zero filling, and delivered-only revenue grouped
  independently by supplier and currency with exact decimal-string minor units.
- Replaced the `/admin` placeholder with responsive tables, navigation, empty states, and a route loading state.
- Added focused authorization and PostgreSQL aggregate coverage with randomized exact IDs and exact cleanup.

## 2026-09-16 — Confirmed dashboard audit corrections

- Replaced the session-timezone-sensitive `timestamptz` day series with UTC date-key and integer-offset generation.
- Explicitly interpreted both stored order timestamps and half-open daily boundaries as UTC.
- Added full threshold, status, boundary, mixed-supplier, disabled-supplier revenue, recursive DTO, and non-UTC DST
  regression coverage using an isolated future window and transaction-local `America/New_York` setting.
- Removed raw product IDs from the dashboard presentation while retaining them as safe keys and tie-breakers.
