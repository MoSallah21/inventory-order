# Architecture Decisions

## ADR-001: Modular monolith

Use one Next.js deployment and one PostgreSQL database. This keeps transactions and authorization direct and avoids
premature distributed infrastructure.

## ADR-002: Prisma 7.10

Pin Prisma Client, CLI, and PostgreSQL adapter to 7.10.0. Prisma 8 is not selected during its current release-candidate
transition.

## ADR-003: Better Auth credentials only

Use Better Auth 1.7.5 for password hashing, opaque cookie sessions, and session persistence. Public sign-up is disabled.
Email verification and password recovery are outside this phase. `Verification` remains only because the adapter's core
schema expects it.

## ADR-004: Current actor is database authoritative

Treat the session only as proof of identity. Reload role and disabled state from PostgreSQL for each protected operation
so stale client or cookie data cannot authorize access.

## ADR-005: Integer minor money

Store AED amounts as `BigInt` minor units. Browser DTO conversion will be added with domain APIs; raw `BigInt` must not
be JSON serialized.

## ADR-006: Supplier-specific orders

Relate each order to one supplier and group multi-supplier purchases under a checkout group. Both supplier and customer
foreign keys use `RESTRICT` deletion behavior.

## ADR-007: Migration owns database-only constraints

Keep Prisma schema relations/indexes in PSL and add unsupported check constraints directly to reviewed migration SQL.
No order-transition trigger is included in this phase.

## ADR-008: Demo data is explicitly gated

The deterministic seed refuses to run unless `SEED_DEMO_DATA=true`. All demo credentials are public test-only values.

## ADR-009: Catalog authority stays server-side

Keep validation, ownership, category availability, archival, and money conversion in `src/modules/catalog`. Server
actions are transport adapters and reauthorize on every call. Public reads return explicit DTOs.

## ADR-010: Managed Cloudinary product images

Use an exact-pinned official Cloudinary server SDK behind a server-only `ProductImageStorage` interface. New products
require validated JPEG/PNG/WebP content up to 5 MiB; filenames and extensions are untrusted. Keep legacy seeded HTTPS
URLs renderable. Because the existing image columns are non-null, represent explicit removal with empty strings rather
than changing the applied schema. Delete only generated keys in `inventory-order/product-images/`.

Preserve images during archival. On create/update database failure, attempt deletion of the new upload while preserving
the original error. After successful replacement/removal, old-object deletion is best effort and a failure produces a
safe cleanup warning. This explicitly accepts the unavoidable database/external-service atomicity boundary.

Use a 6 MiB framework request envelope for the exact 5 MiB application file maximum. Authenticate before inspecting the
file. For replacement/removal, snapshot only image URL, storage key, and archive state; after upload, lock Product before
Category and compare those exact fields. This avoids conflicts for unrelated ordinary edits while safely rejecting
concurrent image/archive lifecycle changes. Invalid provider responses are compensated and cleanup failure is signaled
with sanitized server-only metadata.

Treat returned provider identity and URL as evidence, never deletion or persistence authority. Invalid responses delete
only the generated request key. Persist a canonical unversioned delivery URL derived from the configured cloud name,
generated key, and normalized format after exact-object evidence validation. Require positive safe-integer dimensions.
Support genuine baseline/progressive JPEG and still VP8/VP8L/VP8X WebP structures; animated WebP remains outside scope.

For VP8X, enforce the specified feature-bit layout, reject animation by flag or chunk, require supported metadata flags
and chunks to agree, and require exact canvas/payload equality for the single-image subset. Enforce the strict supported
order: `VP8X`, optional `ICCP`, optional adjacent `ALPH` before lossy `VP8 `, exactly one VP8/VP8L payload, then optional
`EXIF`/`XMP ` in either order. VP8L alpha is intrinsic; unknown and duplicate chunks are rejected. Bound the optional Cloudinary
version syntax to lowercase `v` plus 1–20 decimal digits. Treat all previous-image and ownership FormData fields as
irrelevant; lifecycle authority comes from the session-backed PostgreSQL actor and locked Product state.

## ADR-011: Integration cleanup is exact-ID scoped

Database integration tests generate unique IDs and delete only the exact product, category, and user IDs they created.
They never truncate or broadly clean shared local tables.

## ADR-012: Canonical stock input syntax

Parse raw stock form entries before coercion. Accept only `0` or a non-zero decimal digit followed by decimal digits;
reject whitespace, signs, leading zeroes, fractions, alternate bases, exponent notation, locale formatting, unsafe
integers, and values above the business bound. Retain numeric validation in the catalog service.

## ADR-013: Category activity is serialized with product mutations

Use parameterized `SELECT ... FOR UPDATE` helpers inside short interactive PostgreSQL transactions. Create locks the
category. Update locks the supplier-owned product and then the category. Archive locks the category. This gives the
active-category decision and product write a transaction boundary without changing the applied migration.

## ADR-014: Transactional supplier-specific checkout

Use `CheckoutGroup` as one atomic customer operation. Mixed-supplier carts split into one order per supplier inside the
same transaction. Product rows lock in lexical ID order before writes, and all money uses `BigInt` minor units.

## ADR-015: Durable checkout idempotency

Require a 16-100 character opaque key, lock the customer row, and enforce `(customerId, idempotencyKey)`. Identical
product/quantity replay returns the saved checkout; conflicting reuse returns `DUPLICATE_REQUEST`.

## ADR-016: Explicit transitions and cancellation

Supplier/admin advance `PENDING → CONFIRMED → SHIPPED → DELIVERED`. Customers cancel only pending orders;
supplier/admin can cancel pending or confirmed orders. Delivered and cancelled are terminal. Cancellation locks the
order then products in ID order and atomically restores stock, records compensating movements, and changes status.

## ADR-017: Currency-separated cart presentation

Expose each public product's database currency to the cart and group totals by currency without conversion. The cart
submits only product IDs and quantities; PostgreSQL remains authoritative for currency and price.

## ADR-018: PostgreSQL BIGINT application boundary

Reject multiplication before it exceeds signed PostgreSQL `BIGINT` using division-based detection, and reject
accumulation before addition. Return a typed validation error and roll back the checkout. Cancellation increments are
safe under current constraints because each purchased quantity is at most 10,000 and stock was decremented by that
same quantity; the integer stock column and nonnegative check remain the final database boundary.

Cross-table role consistency and other application-only relational invariants remain possible defense-in-depth schema
work for a separately approved migration; this correction does not change the applied schema.

## ADR-019: Bounded UTC admin aggregates

Define low stock as active products with at most 10 units, excluding archived categories and disabled suppliers. Count
non-cancelled supplier Orders—not CheckoutGroups—over the current and previous six UTC calendar days, so a
mixed-supplier checkout counts once per supplier. Recognize revenue only at `DELIVERED`, group by supplier and currency,
and sum immutable order totals in PostgreSQL. Return aggregate minor units as exact decimal strings and format only in
the page.

Generate daily keys from a UTC date plus integer offsets rather than adding one-day intervals to `timestamptz` values.
Interpret both stored order timestamps and half-open boundaries explicitly as UTC, avoiding session-timezone coercion.
Keep delivered historical revenue visible when a supplier is later disabled; disablement governs current participation,
not historical recognition.
