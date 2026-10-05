# dlt REST Postgres

The current template release is `v1.0.1`; [VERSION](VERSION) is authoritative. This is the first standalone source-release recipe, using **dlt `1.30.0`** to load a specific paginated orders API into private PostgreSQL. It is an unpublished marketplace candidate. A source release does not prove marketplace publication or live Railway qualification. This release must be qualified independently.

Main upstream products: [dlt](https://github.com/dlt-hub/dlt) and [PostgreSQL](https://www.postgresql.org). Python/dependency pins live in [pyproject.toml](pyproject.toml), [uv.lock](uv.lock), and [Dockerfile](Dockerfile). The authoritative PostgreSQL patch and immutable digest are in [Dockerfile.postgres](Dockerfile.postgres); template SemVer is independent of upstream versions.

## Services and release source

Two private repo-backed services select `tech-progress/dlt-rest-postgres`, branch `release-v1`, root `/`: `dlt Loader` builds `Dockerfile`, and the least-privilege `Postgres` wrapper builds `Dockerfile.postgres`. Verify source access, the existing branch, and the exact commit before deployment. These are source-selection instructions, not evidence that a repository, release, deployment, or marketplace listing has been created.

Only Postgres has storage: one **5000 MB** mount at `/var/lib/postgresql/data`, with `PGDATA=/var/lib/postgresql/data/pgdata`. The loader has disposable scratch and no volume. Both services have no public domains or TCP proxies. No web UI, API fixture, Docker socket, or public listener is deployed.

The loader's native Docker command is `python pipeline.py`. Keep its hourly UTC schedule `0 * * * *`, one replica, and restart policy `NEVER`, with no Start Command override or HTTP health check. It exits after a run; success means exit 0 plus completed loads and reconciliation. Build success, database readiness, or a live replica alone cannot establish ingestion success. Railway skips overlapping cron executions; a PostgreSQL advisory lock also fails competing jobs with the same pipeline/dataset identity.

## Expected orders API

This recipe implements a specific API contract. It is not an arbitrary REST connector or a verified adapter for any real provider. Requests use `Authorization: Bearer <SOURCE_API_TOKEN>` and:

```http
GET <SOURCE_BASE_URL>/<SOURCE_ENDPOINT>?page=1&page_size=50&updated_since=1727740800
```

The paginator is `page_number`, with `base_page=1`, `total_path=total_pages`, and records selected from `data`:

```json
{"data":[{"id":1,"customer":"customer-1","status":"paid","amount_cents":1200,"updated_at":1727740800}],"total_pages":1}
```

- `id`: stable, non-null integer primary key; loading uses `merge` keyed by `id`.
- `updated_at`: non-null integer **Unix seconds**, not milliseconds or an ISO string. Advance it whenever a record changes.
- `amount_cents`: non-null integer revenue in cents. The example also carries `customer` and `status` for reporting.
- `data`: array of orders; `total_pages`: total page count for this filtered scan. Pages start at 1, using `page`; the API must support `page_size`.
- `updated_since`: inclusive lower bound on `updated_at`. Provide stable pagination/snapshot semantics throughout a scan and retain replayable records.

Before extraction, `sync_destination()` restores completed cursor/schema state from PostgreSQL. The initial cursor is `0`; the default `3600`-second lookback replays bounded overlap and merge updates existing IDs. Changing `SOURCE_INITIAL_CURSOR` alone does not reset existing state. Failed extraction/loading exits nonzero; a later run can replay from completed destination state. Unfinished local packages are not recovered after scratch replacement. This does not guarantee exactly-once ingestion, delete-aware CDC, or HA. Hard deletes remain in the warehouse; backdated changes beyond the lookback can be missed. Changing API shape requires source changes and fresh qualification.

## Railway setup

1. Review [PUBLISHING.md](PUBLISHING.md), confirm reusable source access, and install authoring tooling with `npm ci --ignore-scripts`. Select the standalone source explicitly:

   ```bash
   export TEMPLATE_SOURCE_REPO=tech-progress/dlt-rest-postgres
   export TEMPLATE_SOURCE_BRANCH=release-v1
   export TEMPLATE_SOURCE_ROOT_DIR=/
   ./node_modules/.bin/railway-iac-ts .railway/railway.ts
   ```

   Compilation is offline: it does not establish GitHub access or create resources. The authoring code's monorepo fallback is `/dlt-rest-postgres`; explicitly override it with `/` for standalone distribution.
2. Review and configure the graph in an authorized Railway project. Preserve private networking, the single Postgres mount, independent generated database credentials, and native command/cron settings.
3. Supply `SOURCE_BASE_URL` with your **actual HTTPS API base URL** and `SOURCE_API_TOKEN` with its **actual upstream read-only bearer token**. Both are required empty user inputs, not generated values. A generated token cannot authenticate to your provider. Blank fields fail closed. Do not use a placeholder or synthetic fixture as the default source.
4. Verify least privilege, completed loads/reconciliation, failed-source behavior, replacement/replay, and backup restoration against your compatible source. Configure backups and alerts before production scheduling. See [SUPPORT.md](SUPPORT.md) and [UPGRADE.md](UPGRADE.md).

## Variables

Values are scoped per service. [template-defaults.json](template-defaults.json) and [.env.example](.env.example) record defaults; local secrets/environment files must stay uncommitted.

| Service / variable | Required value or default |
| --- | --- |
| Postgres `PORT` | `5432`, private only |
| Postgres `POSTGRES_DB` | `warehouse` |
| Postgres `POSTGRES_USER` | `postgres`, initialization/backup administrator only |
| Postgres `POSTGRES_PASSWORD` | Required nonempty independently generated administrator secret; never given to the loader |
| Postgres `DLT_LOADER_PASSWORD` | Required nonempty independently generated loader secret, distinct from the administrator secret |
| Postgres `PGDATA` | `/var/lib/postgresql/data/pgdata` |
| Loader `PGHOST` | `${{Postgres.RAILWAY_PRIVATE_DOMAIN}}` |
| Loader `PGPORT` | `5432` |
| Loader `PGDATABASE` | `${{Postgres.POSTGRES_DB}}`, resolving to `warehouse` |
| Loader `PGUSER` | `dlt_loader` |
| Loader `PGPASSWORD` | `${{Postgres.DLT_LOADER_PASSWORD}}` |
| Loader `PGSSLMODE` | `prefer` on Railway private networking; `verify-full` requires operator-managed CA configuration for external TLS |
| Loader `SOURCE_BASE_URL` | Required empty user input: actual HTTPS API base URL without embedded credentials |
| Loader `SOURCE_API_TOKEN` | Required empty user input: actual upstream read-only bearer token; not generated |
| Loader `SOURCE_ENDPOINT` | `orders`, relative path below the base URL |
| Loader `SOURCE_PAGE_SIZE` | `50`, supported integer in 1..1000 |
| Loader `SOURCE_INITIAL_CURSOR` | `0`, nonnegative Unix-second initial cursor |
| Loader `SOURCE_LOOKBACK_SECONDS` | `3600`, nonnegative replay overlap in seconds |
| Loader `ALLOW_INSECURE_SOURCE` | `false`; `true` only for local HTTP fixture qualification |
| Loader `PIPELINE_NAME` | `rest_orders`, stable lowercase SQL-safe identity |
| Loader `DATASET_NAME` | `rest_warehouse`, fixed schema identity for this wrapper |
| Loader `PIPELINES_DIR` | `/tmp/dlt-pipelines`, disposable extraction/load scratch |
| Loader `RUNTIME__DLTHUB_TELEMETRY` | `false` |
| Authoring `TEMPLATE_SOURCE_REPO` | Explicit `tech-progress/dlt-rest-postgres`; verify real source access |
| Authoring `TEMPLATE_SOURCE_BRANCH` | Explicit existing `release-v1` |
| Authoring `TEMPLATE_SOURCE_ROOT_DIR` | Explicit `/` for standalone; code fallback `/dlt-rest-postgres` is for monorepo use |

The empty-volume wrapper creates `dlt_loader` as a nonsuperuser owning only `rest_warehouse` and `rest_warehouse_staging`. It denies public/unrelated schema writes, database creation, role creation, and replication. Keep these schema/database identities unless you adapt and requalify initialization. Administrator credentials must never reach the loader. Reports need independent read-only roles. Changing initialization environment variables alone does not rotate existing database passwords; coordinate authenticated SQL role rotation and service references. Revoke/rotate source tokens at the provider.

## Local checks and evidence

Run from this directory with Node 22+, Python 3.12, uv, Docker/Compose, `timeout`, and OpenSSL available:

```bash
npm ci --ignore-scripts
node scripts/verify-docs.mjs
node --test tests/docs.test.mjs
TEMPLATE_SOURCE_REPO=tech-progress/dlt-rest-postgres TEMPLATE_SOURCE_BRANCH=release-v1 TEMPLATE_SOURCE_ROOT_DIR=/ ./scripts/verify.sh
./scripts/build.sh
./scripts/smoke.sh
```

These are local checks. The authenticated synthetic fixture is qualification only, never a default deployment source or a claim about a real provider. Historical local evidence for **v1.0.0 (2026-10-02)** covered 100 initial orders across two pages, duplicate-free replay, update+insert to 101 unique orders, interrupted SQL loading and scratch deletion, completed cursor recovery, denied out-of-schema operations, unavailable-source nonzero exit, and whole-destination dump/restore into a fresh volume followed by replay. That evidence belongs to earlier pins and must be repeated for this release; it does not establish current live qualification or observed hourly Railway scheduler firing.

For your own API, supply required Compose credentials from your environment without committing `.env`, then use `./scripts/build.sh` and `./scripts/start.sh`. Compose keeps the database private and runs one loader invocation; it does not simulate the hourly scheduler. Stop only this stack with `docker compose down`; add `--volumes` only when intentionally deleting local data.

## Persistence, cleanup, and license boundary

Back up the entire destination database, including warehouse tables, staging/schema metadata, and `_dlt_*` state. A volume is persistence, not a backup. Restore and reconcile data/state together before resuming. Source-specific pagination, capacity sizing, monitoring, and production restore procedures remain operator responsibilities.

Qualification cleanup follows standard deletion plus verified zero compute and disclosed retention: stop schedules, verify zero running/transitional instances and zero queued work, delete owned temporary resources, and disclose retained logs/backups/volumes and provider retention. Physical storage deletion and billing-zero proof are not publication gates under the accepted policy.

MIT for newly authored recipe code only; see [LICENSE](LICENSE). Upstream software, binaries, dependencies, and marks keep their own terms. [LICENSE_REVIEW.md](LICENSE_REVIEW.md) records selected upstream license context. A finite source-only permission/default review does not clear the assembled image: it does not relabel combined runtime binaries or grant security clearance. Final image contents, notices, source access, and live qualification require independent review.

See [MARKETPLACE.md](MARKETPLACE.md), [CHANGELOG.md](CHANGELOG.md), and the guides linked above. Marketplace publication requires separate metadata sync and a passing live audit; no deployment identifiers or share codes are asserted here.
