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
- Role-aware authenticated navigation, useful supplier/customer homes, and Better Auth sign-out.
- Safe anonymous, disabled-account, and wrong-role page redirects.
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
- Role-aware application shell, deterministic return paths, readable order statuses/actions, and role-specific empty
  states across the evaluator journeys.

## Functional UX stabilization

The verified route map and issue-level audit are recorded in `docs/UX_ROUTE_AUDIT.md`. Customer cart access is now
protected, public catalog pages retain a contextual route back to the authenticated workspace, order actions appear
beside the current status before line items, and successful checkout clears browser cart state before deterministic
replacement navigation to `/orders?placed=1`. Supplier product forms explicitly separate basic information, price and
inventory, category, and image choices. Cosmetic animation, dense dashboard redesign, pagination, and a large component
library remain intentionally deferred.

The final automated suite passes 356/356 tests across 23 files. The 2026-09-17 browser journey used the real local app
and seeded accounts. It verified customer catalog/detail/cart/quantity/checkout, a pending cancellation and restored
stock message; supplier overview/orders, Pending → Confirmed → Shipped → Delivered, terminal action removal, and a
product save with no replacement image; admin dashboard/categories/orders and deterministic returns; and anonymous
catalog access plus protected-order redirect to sign-in. This is manual browser verification, not an automated E2E
suite.

Canonical seeded stock is `0 / 3 / 120`. Current local smoke stock is `0 / 2 / 118`: the earlier preserved demo orders
account for `0 / 2 / 119`, and this journey preserved one new delivered Safety Gloves order that consumed one further
unit. The journey also preserved a separate cancelled two-unit Safety Gloves order whose cancellation restored its
stock. Test-owned User, Product, and Order record counts are all zero.

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

The authenticated-navigation phase adds 20 focused passing assertions for role links and route existence, Better Auth
sign-out success/failure/repeated-click behavior, enabled and disabled sign-in redirects, protected-page redirect
policy, invalidated-session actor resolution, dynamic actor checks, and removal of placeholder copy. The complete suite
passes all 348 tests across 22 files with existing demo orders preserved. The canonical seeded product stock is
`0 / 3 / 120`; the current local post-smoke state is `0 / 2 / 119` because preserved demo orders consumed stock.

The authenticated role-switch smoke was performed manually through the real browser and application. The verified
local sequence was:

1. Signed in as Supplier.
2. Opened Supplier products and orders.
3. Signed out using the production Better Auth `SignOutButton`.
4. Refreshed/reopened a former Supplier protected URL and was redirected to `/sign-in`.
5. Signed in as Admin in the same browser.
6. Opened the Admin dashboard, categories, and orders.
7. Signed out.
8. Signed in as Customer.
9. Opened products, cart, and customer orders.
10. Signed out.
11. Opened `/orders` anonymously and was redirected to `/sign-in` rather than receiving HTTP 500.

The previous server session was unusable after each sign-out, and protected pages remained server-authorized and
dynamic. Component-level browser automation for this flow is not included; this is an accepted assessment-scope
testing boundary, not a claim of automated E2E coverage. The full automated suite remains 348/348 across 22 files.
Canonical seeded stock remains `0 / 3 / 120`, while current local stock remains `0 / 2 / 119` because preserved manual
demo orders consumed stock.

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
