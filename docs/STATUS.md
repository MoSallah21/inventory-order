# Status

## Completed

- Project scaffold and exact dependency pins.
- Strict TypeScript, Tailwind, ESLint, and Prettier configuration.
- Environment validation and safe example environment file.
- Complete Prisma schema and initial migration with requested SQL constraints.
- Serverless-safe Prisma client reuse.
- Better Auth credentials and database sessions.
- Server-side actor and role helpers.
- Typed application errors and safe serialization.
- Deterministic guarded seed and documented demo accounts.
- Minimal sign-in and three protected role placeholders.
- Targeted foundation tests.
- Live migration, seed, constraint, relation, and authentication verification.
- Admin category create/edit/archive UI and services.
- Supplier-owned product create/edit/archive UI and services.
- Public product list/detail with safe DTO filtering.
- PostgreSQL integration coverage for catalog rules and database constraints.
- Strict order parsing, browser-local cart checkout, and durable customer-scoped idempotency.
- Atomic mixed-supplier checkout with deterministic locks, immutable snapshots, and exact stock movements.
- Scoped customer/supplier/admin order DTOs, explicit transitions, and exactly-once cancellation restoration.
- Database-authoritative admin dashboard with low-stock, seven-day order activity, and delivered revenue aggregates.
- Managed Cloudinary supplier product upload, replacement, removal, compensation, and retained-on-archive lifecycle.

## Verification record

Successful:

- Dependency installation and lifecycle scripts.
- `prisma format`.
- `prisma validate`.
- `prisma generate`.
- Offline `prisma migrate diff --from-empty --to-schema ... --script` inspection.
- TypeScript typecheck.
- ESLint.
- 115 unit and PostgreSQL integration tests across 10 files.
- Prettier check.
- Production build.

For the transactional order phase and focused audit corrections, Prisma format/validation/migration status, Prettier,
TypeScript, all 109 tests, ESLint, and the webpack production build passed. The default Turbopack build failed only
because its CSS helper process was denied permission to bind a sandbox port; the required webpack fallback compiled all
15 routes successfully.

The implementation session previously completed live seed and authentication verification. An independent audit later
could not reproduce PostgreSQL connectivity in its own execution environment; that was an auditor-environment result,
not evidence that the earlier checks failed. In this current session, Docker reports PostgreSQL 17.6 healthy and Prisma
reports the single committed migration is applied and the schema is up to date.

Supply-chain and review notes:

- The complete Git diff relative to `633ddeb` is reviewed before handoff.
- No `.env` file, real secret, generated Prisma client, dependency directory, or build output is tracked by project rules.
- The only double assertion is the conventional development singleton holder for Prisma on `globalThis`; there are no
  `any`, suppression comments, or unfinished domain stubs.
- `pnpm list --depth 0` encountered pnpm's local store-index SQLite access error during the final review; exact resolved
  top-level versions remain recorded in `package.json` and the successfully installed lockfile.

The admin dashboard phase passed Prisma format/validation/migration status, Prettier, TypeScript, all 115 tests, ESLint,
and the production build. Focused PostgreSQL smoke coverage verified admin success, non-admin denial, filtering, UTC
order counts, delivered supplier/currency grouping, exact `BIGINT` strings, and exact-ID cleanup.

The dashboard audit added a dedicated `America/New_York` transaction spanning the 2041 DST transition and proved its
seven keys and counts are identical to the UTC-session result. Boundary fixtures cover the exact lower bound, one
millisecond before it, both sides of UTC midnight, and the exclusive upper bound. Historical delivered revenue for a
disabled supplier remains included by policy.

## Managed-image verification note

Automated validation and lifecycle tests use a fake storage provider and never contact Cloudinary. A real local,
credentialed Cloudinary smoke test was completed successfully: one genuine PNG was uploaded, persisted, and rendered
by the application. The smoke Product was removed and its managed Cloudinary object was deleted afterward. No
credential or upload artifact entered Git. A deployment-environment smoke test remains pending until deployment.
Pagination, notifications, CSV export, caching, rate limiting, and deployment remain intentionally deferred.

The managed-image phase plus confirmed audit corrections passed Prisma format/validation/migration status, Prettier,
TypeScript, all 328 tests across 17 files, ESLint,
and the webpack production build. The default Turbopack build failed only because its CSS helper process was denied
permission to bind a sandbox port. The applied migration and schema content remained unchanged.

Audit coverage includes the 6 MiB Server Action envelope versus exact 5 MiB application limit; independently decoded
genuine baseline/progressive JPEG, PNG, VP8, VP8L, and VP8X fixtures; exact-object canonical URL behavior; mandatory
provider dimensions; and expected-key-only compensation. Database-backed action tests mock only session transport and
Cloudinary. Deterministic races cover replacement/replacement, both replacement/removal directions, and both
replacement/archive directions with bounded failure-safe helpers. Cleanup failures emit a sanitized server-side signal.
Automated tests did not contact real Cloudinary.

Demo seed products now keep `/window.svg` as legacy local image metadata and
use the schema's empty-string sentinel for “no managed Cloudinary key.” The
upsert corrects existing demo rows as well as new seeds, so reseeding remains
idempotent and legacy images are never submitted to managed-image deletion.
The final local browser smoke test also confirmed an edit with no selected file,
native create-without-file feedback, and one successful real PNG upload; the
exact smoke product and managed object were removed afterward.

Final audit coverage additionally rejects VP8X animation through both feature flags and `ANIM`/`ANMF` chunks, checks
reserved bits and supported metadata flags, and requires exact canvas/payload dimensions for the supported single-still
subset. Cloudinary versions are limited to lowercase `v` plus 1–20 decimal digits. URL tests cover raw/encoded/double-
encoded separators, backslashes, suffixes, extra extensions/paths, malformed versions, transformations, query,
fragment, credentials, and ports. Cross-owner replacement and removal are separate PostgreSQL-backed action cases;
owner-path injection proves previous metadata remains database-trusted. Every production race await has its own named
internal timeout in addition to failure-safe final settlement.

## Test isolation

Catalog integration tests require the configured PostgreSQL database. Each run uses randomized IDs and cleanup deletes
only the exact records created by that run. Seeded data is never selected for cleanup.

Order tests follow the same exact-ID rule. Explicit-lock coverage uses exact `pg_blocking_pids` relationships, bounded
polling, and `FOR KEY SHARE` barriers that distinguish the locking selects from later non-key updates.

Dashboard tests also use one randomized exact-ID set and delete only those orders, checkout groups, products,
categories, and users. They never truncate or alter demo records.
