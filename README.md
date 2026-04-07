# Traffic Intelligence Framework (MVP)

Internal stack for **proxy-based vendor quality**, **experiments**, **fraud risk (ANO)**, and a **buyer dashboard**—aligned to: no client landing-page control, no conversion labels, drifting traffic.

## Stack

- **Next.js 15** (App Router) — UI + API routes  
- **PostgreSQL** + **Prisma** — events, sessions, scores, experiments, alerts  
- **TypeScript** — scoring, fraud rules, deterministic experiment assignment  
- **Batch jobs** (`tsx scripts/jobs/*`) — session close, scores, recommendations, alerts  

## Quick start

**Always `cd` into the folder that contains `package.json` first.**  
Use `pwd` and `ls` to confirm—you should see `package.json`, `prisma/`, and `docker-compose.yml`.

**Create `.env` (pick one—no template files required):**

```bash
npm run setup:env
```

Or:

```bash
bash scripts/setup-env.sh
```

Or paste this **single line** (note the `>` redirect):

```bash
echo 'DATABASE_URL="postgresql://tif:tif@localhost:5433/traffic_intel?schema=public"' > .env
```

**Shell gotchas:**

- Put **`&&`** between commands: `cd Traffic-Intelligence-Framework && npm run setup:env` — not a space.
- Don’t run comment lines: lines starting with `#` are not commands.

Then:

```bash
docker compose up -d
npx prisma db push
npm run db:seed
npm run jobs:all
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Health: `GET /api/health`.

## Jobs (run order)

1. `npm run jobs:sessions` — aggregate `traffic_events` → `sessions` (engaged rule: dwell ≥10s or ≥2 events)  
2. `npm run jobs:scores` — `vendor_scores` (shrinkage ER, CPE, ANO penalty, stratum percentiles / **top ~20%**)  
3. `npm run jobs:recommendations` — rule-based `recommendations`  
4. `npm run jobs:alerts` — fraud / quality alerts  

Or `npm run jobs:all`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ingest` | Ingest click/beacon (`vendorExternalRef`, `campaignExternalRef`, …) |
| `GET` | `/api/dashboard` | JSON dashboard payload |
| `GET` | `/api/experiments/:runId/assign?subjectId=` | Deterministic arm + immutable assignment row |
| `GET` | `/api/health` | DB connectivity |

## Strata

`stratum_key` = `geo|device|vertical` so vendors are comparable within the same slice (not per internal campaign UUID).

## MVP simplifications

- Stability term in scores is a **constant** (Phase 2: CV over daily ER).  
- **7d** window only in jobs (Phase 2: 7d/28d blend in SQL).  
- Alerts / recommendations **replace** rows on each run where noted—tighten for production retention.  

## License

Proprietary — internal assessment / Benchmark Solu.
