# Inventory & Order Management System

Role-based inventory and order management modular monolith with database-backed authentication, category management,
supplier-owned product management, and a public catalog.

## Status

Implemented:

- Next.js 16 App Router, strict TypeScript, Tailwind CSS, ESLint, and Prettier.
- PostgreSQL schema and initial Prisma migration.
- Better Auth email/password credentials with database-backed sessions.
- Server-side actor, disabled-account, and role checks.
- Minimal sign-in and protected `/admin`, `/supplier`, and `/account` placeholders.
- Deterministic demo users, categories, and products.
- Admin category management at `/admin/categories`.
- Supplier product management at `/supplier/products`.
- Server-rendered public catalog at `/products`.
- Unit and isolated PostgreSQL integration tests.

Not implemented yet: product image upload, cart, checkout, order transitions, dashboards, search, pagination,
notifications, exports, caching, and rate limiting.

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
