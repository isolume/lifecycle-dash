# UA Innovate 2026 Lifecycle Dashboard

Next.js + PostGIS dashboard for Southern Company network lifecycle analytics.

## Stack

- Next.js (App Router)
- PostgreSQL + PostGIS
- React Leaflet map visualization
- Recharts for breakdown views
- TypeScript ETL ingestion from Excel

## Local setup

1. Copy env file:

```bash
cp .env.example .env.local
```

2. Start PostGIS:

```bash
docker compose up -d postgres
```

3. Install dependencies:

```bash
npm install
```

4. Run migrations:

```bash
npm run migrate
```

5. Ingest workbook:

```bash
npm run ingest -- --file "./data/UAInnovateDataset-SoCo.xlsx"
```

6. Start app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker Compose setup (app + PostGIS)

1. Ensure the workbook exists at `./data/UAInnovateDataset-SoCo.xlsx`.
2. Build and run:

```bash
docker compose up --build
```

The app container will run migrations, ingest the workbook from `/app/data/UAInnovateDataset-SoCo.xlsx`, and then start Next.js on `http://localhost:3000`.

## Scripts

- `npm run migrate` - applies SQL migrations from `db/migrations`
- `npm run ingest -- --file <path>` - full refresh from Excel workbook
- `npm run dev` - Next.js dev server
- `npm run lint` - ESLint
- `npm run test` - Vitest unit tests

## API routes

- `GET /api/health`
- `GET /api/dashboard/filters`
- `GET /api/dashboard/kpis`
- `GET /api/dashboard/heatmap`
- `GET /api/dashboard/map/states`
- `GET /api/dashboard/map/states/:stateCode/counties`
- `GET /api/dashboard/map/states/:stateCode/counties/:countyFips/sites`
- `GET /api/dashboard/map/states/:stateCode/counties/:countyFips/sites/:siteCode`
- `GET /api/dashboard/breakdown`
- `GET /api/dashboard/radius-groups`
- `GET /api/devices`
- `GET /api/exceptions`
- `POST /api/exceptions`
- `PATCH /api/exceptions/:id`
- `DELETE /api/exceptions/:id`

## Deployment notes (Vercel + self-hosted Postgres)

- Use a public TLS endpoint for Postgres.
- Set `DATABASE_SSL=true` in Vercel env vars.
- Use a least-privileged DB user for app runtime.
- Run `npm run migrate` and `npm run ingest` against production DB before enabling app traffic.

## Data methodology

See `/methodology` page in-app for transform assumptions, source precedence, and scoring details.

Current implementation highlights:
- Per-unit device identity (`device_id`) is generated as `device_name::serial` (`NO-SERIAL` fallback) and multi-serial rows are expanded.
- Exceptions are unit-aware (`device_id`) with backward-compatible `deviceName` support.
- Planning-first defaults are enabled across API/query/UI:
  - include out-of-scope = false
  - include decom sites = false
- Time preview uses a dynamic as-of date (default current date) and configurable lifecycle window.
- Estimated refresh cost uses total estimated cost (material + labor fallbacks).
- Support/security correlation charts are included; security is lifecycle-derived proxy data.
