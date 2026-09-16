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

## Admin dashboard module

`src/modules/admin/dashboard.ts` reloads the actor from PostgreSQL before any dashboard data is queried and requires an
enabled `ADMIN`. One bounded service call returns explicit safe DTOs for all three views. Low stock uses an indexed,
allow-listed Prisma query; daily activity uses `generate_series` so all seven UTC dates exist; revenue is aggregated by
PostgreSQL from delivered `Order.totalMinor` snapshots and returned as decimal strings. Caller values are never SQL
interpolated, currencies are grouped independently, and no raw user/authentication records cross the service boundary.

Daily activity passes a canonical `YYYY-MM-DD` UTC key, generates integer offsets, and performs PostgreSQL `date`
arithmetic. Both the stored timestamp-without-time-zone value and each half-open day boundary are explicitly interpreted
as UTC before comparison, so session timezone and daylight-saving transitions cannot change a bucket. Revenue retains
delivered history for disabled suppliers because account disablement must not erase recognized business history.

## Deferred architecture

Managed image storage, pagination, notifications, exports, caching, and rate limiting remain deferred. The
temporary image boundary accepts HTTPS URLs and presents no fake upload control.

## Order module

`src/modules/orders` owns raw input parsing, placement, safe DTO reads, and transitions. A checkout accepts at most 50
distinct products, canonical quantities from 1-10,000, and a 16-100 character opaque key. Duplicate products are
rejected; identity, supplier, price, total, status, and stock are always database-authoritative.

Placement is one PostgreSQL transaction: lock the customer, resolve idempotency, lock all products in sorted ID order,
validate availability, then create one checkout group and supplier-specific orders, snapshots, conditional decrements,
and movements. Mixed-supplier baskets commit or roll back as one unit. Identical key replay returns the existing group;
a changed payload is rejected.

Cart presentation groups integer minor-unit totals by the currency returned by the public product DTO. It never converts
or combines currencies, and checkout continues to ignore browser price/currency values. Money multiplication and order
accumulation reject values above PostgreSQL's signed `BIGINT` maximum (`9223372036854775807`) before persistence.

Transitions lock the order before authorization and policy checks. Supplier/admin advance
`PENDING → CONFIRMED → SHIPPED → DELIVERED`; customers may cancel pending orders, and supplier/admin may cancel pending
or confirmed orders. Delivered/cancelled are terminal. Cancellation locks products in sorted ID order and restores
stock plus compensating movements in the status transaction. Archived products remain eligible for restoration.

Integration regression tests place `FOR KEY SHARE` barriers on the target Product or Order. That mode conflicts with
the production `SELECT ... FOR UPDATE` but not the later non-key stock/status update, so exact
`pg_backend_pid()`/`pg_blocking_pids()` correlation proves the explicit pre-validation locks. Barrier acquisition and
operation settlement use named internal timeouts and immediate rejection handling.
