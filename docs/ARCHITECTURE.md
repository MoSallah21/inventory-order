# Architecture

## Shape

The application is a modular monolith deployed as one Next.js application backed by one PostgreSQL database.

- `src/app`: routes, pages, and HTTP integration.
- `src/modules`: trusted application/domain modules.
- `src/lib`: database, environment, error, and money infrastructure.
- `prisma`: schema, SQL migrations, and deterministic seed.
- `tests`: focused unit tests and isolated PostgreSQL integration tests.

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

## Catalog module

`src/modules/catalog/service.ts` owns category and product rules. Server actions reload the database-backed actor, then
pass it into services. Supplier identity is never accepted in product input; it is derived from that actor. Ownership
is checked before every supplier product read or mutation.

AED form values are converted directly from decimal strings to `BigInt` minor units without floating point. Public
queries use an explicit safe selection and DTO, excluding archived products, archived categories, and products owned
by disabled suppliers.

Raw stock form values accept canonical unsigned decimal syntax only: `0` or a non-zero digit followed by digits.
Leading zeroes and whitespace are rejected before numeric conversion. The service repeats safe-integer, nonnegative,
and business-bound checks as defense in depth.

Product creation locks its selected category before checking activity and writing. Product updates lock the
supplier-owned product first and the selected category second. Category archival uses the same category row lock. If
archival locks first, a waiting product mutation sees the archived state and fails. If a product mutation locks first,
it may commit while the category is active; subsequent archival is allowed and the existing public query immediately
hides that product. Every critical-section query uses the transaction-scoped Prisma client.

Integration tests create records with a random per-run prefix. Cleanup deletes only exact IDs owned by that run; it
never truncates tables or deletes seed/application records.

## Deferred architecture

Checkout transactions, stock concurrency control, state transitions, cancellation restoration, managed image storage,
and dashboards are reserved for later phases. The temporary image boundary accepts HTTPS URLs and presents no fake
upload control.
