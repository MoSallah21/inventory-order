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

## ADR-010: Temporary external image URL boundary

Until managed uploads exist, require an HTTPS image URL for new and updated products. Do not display a file input or
claim that the application uploads the image.

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
