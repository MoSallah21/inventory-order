# Architecture

## Shape

The application is a modular monolith deployed as one Next.js application backed by one PostgreSQL database.

- `src/app`: routes, pages, and HTTP integration.
- `src/modules`: trusted application/domain modules.
- `src/lib`: database, environment, error, and money infrastructure.
- `prisma`: schema, SQL migrations, and deterministic seed.
- `tests`: focused foundation tests.

## Database model

Better Auth owns `User`, `Session`, `Account`, and adapter-required `Verification` records. Application entities are
`Category`, `Product`, `CheckoutGroup`, `Order`, `OrderItem`, and `StockMovement`.

Important modeling decisions:

- Product and order money use `BigInt` minor units, never floating point.
- Products are archived with `archivedAt`.
- Every product has exactly one category and one supplier.
- Checkout idempotency is unique per customer.
- A multi-supplier checkout is represented by one `CheckoutGroup` and supplier-specific orders.
- Orders relate to both customer and supplier with named, restricted relations.
- Order items retain name and unit-price snapshots.
- Stock movement uniqueness prevents duplicate decrement/restoration movement types for an order item.
- SQL check constraints protect nonnegative stock/money and exact line arithmetic.

## Authentication and authorization

Better Auth exposes only email/password credentials and database-backed sessions. Public sign-up, verification,
password recovery, and external providers are disabled or absent.

`getCurrentActor` validates the session and reloads the actor from PostgreSQL. `requireAuthenticatedActor` rejects
missing and disabled actors. `requireRole` applies server-side role authorization. Protected pages call these helpers
inside their server components; client visibility is not treated as authorization.

## Deferred architecture

Checkout transactions, stock concurrency control, state transitions, cancellation restoration, product ownership
services, image storage, and dashboards are deliberately reserved for later phases. No fake service shells exist.
