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

## 2026-09-16 — Managed product images

- Confirmed a clean synchronized baseline, healthy PostgreSQL, and sufficient unchanged image URL/storage-key columns.
- Added exact-pinned Cloudinary SDK integration behind a server-only storage interface with lazy credential checks,
  controlled UUID keys, validated provider responses, and namespace-restricted idempotent deletion.
- Added bounded JPEG/PNG/WebP `File` validation using MIME/signature agreement and a 5 MiB limit.
- Added database-authoritative supplier reload, ownership concealment, create/update compensation, post-commit cleanup,
  explicit removal, legacy external-image compatibility, and retained-on-archive policy.
- Replaced the supplier URL field with upload/preview/remove controls and stable public placeholders.
- Added fake-provider unit and PostgreSQL lifecycle coverage; no automated test contacts Cloudinary.

## 2026-09-16 — Managed-image audit corrections

- Raised only the Server Action multipart envelope to 6 MiB while retaining the exact 5 MiB file boundary.
- Moved action authentication and update ownership preflight ahead of file inspection/reading.
- Replaced signature-only checks with bounded JPEG marker, PNG chunk, and WebP RIFF/chunk structural validation.
- Hardened Cloudinary URL, key, resource, format, byte, and dimension validation and compensated invalid responses.
- Added sanitized cleanup-failure signals without changing the original safe error returned to callers.
- Added optimistic trusted snapshots plus transactional Product-row comparison to prevent stale replacement/removal
  writes and incorrect deletion during replacement, removal, and archive races.
- Added focused request-envelope, structural, provider-adapter, action-order, lifecycle, and deterministic concurrency
  tests using fake providers only.

## 2026-09-17 — Remaining managed-image audit corrections

- Restricted invalid-response cleanup to the generated expected key; distinct returned IDs are never deletion targets.
- Bound provider evidence to the exact object path and persisted a canonical URL rebuilt from trusted values.
- Made Cloudinary width and height mandatory positive safe integers.
- Added genuine anonymous baseline/progressive JPEG, PNG, VP8, VP8L, and VP8X fixtures generated by Pillow and
  independently decoded with `sips` and identified with `file`; animated WebP remains rejected.
- Extended JPEG parsing across multiple scans and WebP parsing across bounded padded chunks with a required image payload.
- Replaced mocked-authorization action tests with real PostgreSQL actor/ownership tests that mock only session transport
  and Cloudinary.
- Added replacement-first/stale-removal coverage and made every image race operation bounded, tracked, abortable, and
  settled from `finally`.

## 2026-09-17 — Final managed-image audit corrections

- Implemented VP8X feature/reserved-bit validation, unconditional animation-chunk rejection, supported metadata-flag
  consistency, and exact canvas-to-single-payload dimension matching.
- Bounded Cloudinary evidence versions to lowercase `v` plus 1–20 decimal digits and expanded exact-object adversarial
  URL tests for separators, encodings, suffixes, versions, paths, transformations, authority, query, and fragment tricks.
- Added explicit WebP duplicate/conflict/padding/truncation/RIFF/animation/canvas mutations and JPEG multi-scan,
  inter-scan marker, byte-stuffing, restart-marker, and truncation branch proof.
- Split real database-backed cross-owner replacement/removal action cases and proved malicious previous metadata and
  supplier fields cannot influence upload, deletion, ownership, or persistence.
- Replaced every direct image-race operation await with named bounded result helpers while retaining abort/release and
  bounded settlement in `finally`.

## 2026-09-17 — Final remaining managed-image corrections

- Added a strict VP8X still-image state machine covering ICCP placement, adjacent lossy ALPH data, intrinsic VP8L alpha,
  post-image EXIF/XMP ordering, feature consistency, duplicates, and independently mutated reserved fields.
- Proved cross-owner replacement and removal serialize the concealed `NOT_FOUND` outcome exactly and separately proved
  the underlying service error code without revealing ownership.
- Added absent, undefined, null, empty, whitespace-only, and non-string `secure_url` cases through the production adapter
  and database-backed action path, with expected-key-only compensation and no persistence.
