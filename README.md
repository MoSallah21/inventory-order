# Inventory & Order Management System

Role-based inventory and order management modular monolith with database-backed authentication, catalog management,
transactional customer checkout, and an authorized order-status workflow.

## Status

Implemented:

- Next.js 16 App Router, strict TypeScript, Tailwind CSS, ESLint, and Prettier.
- PostgreSQL schema and initial Prisma migration.
- Better Auth email/password credentials with database-backed sessions.
- Server-side actor, disabled-account, and role checks.
- Minimal sign-in and protected `/admin`, `/supplier`, and `/account` placeholders.
- Deterministic demo users, categories, and products.
- Admin dashboard at `/admin` with low-stock, daily-order, and supplier-revenue views.
- Admin category management at `/admin/categories`.
- Supplier product management at `/supplier/products`.
- Server-rendered public catalog at `/products`.
- Unit and isolated PostgreSQL integration tests.
- Browser-local cart, atomic multi-supplier checkout, durable idempotency, and role-scoped order history/workflows.

Not implemented yet: product image upload, search, pagination, notifications, exports, caching, and rate
limiting.

## Admin dashboard definitions

The server-authorized `/admin` dashboard treats stock of 10 units or fewer as low. Its activity table reports the
latest seven UTC calendar days, including zero-order days, with explicit half-open UTC boundaries that do not depend on
the PostgreSQL session timezone. All non-cancelled Orders count. Because checkout creates one Order per supplier, a
mixed-supplier checkout contributes one count for each supplier order. Revenue recognizes only `DELIVERED` order
totals, uses their immutable minor-unit snapshots, and keeps each supplier/currency pair separate. Delivered historical
revenue remains visible after a supplier is disabled; disabling affects current catalog access and mutations, not
already recognized revenue.

## Product images

Product creation currently accepts a validated HTTPS image URL. This is an explicit temporary boundary: there is no
file picker and no implied upload. Managed image upload is reserved for the next dedicated phase.

## Requirements

- Node.js 22.12 or later (Node 24 LTS is suitable)
- pnpm 11.19.0
- PostgreSQL

## Setup

```bash
pnpm install
cp .env.example .env
```

Set a real local `DATABASE_URL` and generate a random `BETTER_AUTH_SECRET` of at least 32 characters. Never commit
`.env`.

### Local PostgreSQL

The local database uses Docker Compose and the exact `postgres:17.6-alpine` image.

```bash
docker compose config
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose stop
```

To restart stopped services, run `docker compose start`. To stop and remove the container while preserving its named
volume, run `docker compose down`.

**Destructive — deletes all local database data:**

```bash
docker compose down --volumes
```

Do not run the destructive command unless losing the local database is intentional.

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

For local migration development, use `pnpm db:migrate --name <migration-name>` instead of deploy.

## Demo seed

Set `SEED_DEMO_DATA=true` only in a local/demo environment, then run:

```bash
pnpm db:seed
```

All demo accounts use password `DemoPass!2026`:

| Role     | Email                    |
| -------- | ------------------------ |
| Admin    | `admin@example.test`     |
| Supplier | `supplier1@example.test` |
| Supplier | `supplier2@example.test` |
| Customer | `customer@example.test`  |
| Customer | `customer2@example.test` |

The seed is deterministic and idempotent. It updates the credential hashes on each run. Demo seeding refuses to run
unless explicitly enabled.

## Run

```bash
pnpm dev
```

Open `http://localhost:3000/sign-in`. Successful sign-in redirects according to the database-backed role.

Customers use `/products`, `/cart`, and `/orders`. Suppliers and admins use `/orders`; every read and mutation is
authorized again on the server.

Cart totals are grouped by the product's database currency without conversion. A mixed AED/USD checkout therefore
shows independent AED and USD totals rather than a misleading combined amount.

## Verification

```bash
pnpm db:validate
pnpm db:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database migration and seed verification require a reachable PostgreSQL server:

```bash
pnpm db:migrate:deploy
SEED_DEMO_DATA=true pnpm db:seed
```

In PowerShell, set the environment variable first with `$env:SEED_DEMO_DATA='true'`.

The complete test suite requires the configured local PostgreSQL database. Integration records use unique IDs and
cleanup targets only those exact IDs.

See [docs/STATUS.md](docs/STATUS.md) for the current verification record.
