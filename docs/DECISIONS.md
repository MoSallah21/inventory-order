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
