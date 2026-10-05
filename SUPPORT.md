# Support boundary

Template release **v1.0.1**; [VERSION](VERSION) is authoritative. A source release does not prove marketplace publication or live Railway qualification. This release must be qualified independently. Historical local evidence for v1.0.0 (2026-10-02) exercised authenticated synthetic orders, interruption/replay, privilege denial, failed-source exit, and destination dump/restore. It does not establish current live qualification or observed hourly Railway scheduler firing.

This evaluation/small-workload recipe supports a specific orders API: `page_number` starting at 1, `data`, `total_pages`, inclusive `updated_since`, stable integer `id`, integer `updated_at` in Unix seconds, and integer `amount_cents`. dlt `1.30.0` performs `merge` keyed by `id` and default 3600-second lookback; completed state restores from PostgreSQL. The authenticated synthetic fixture is qualification only, never a default source or proof of a real provider's behavior. There is no arbitrary REST/provider adapter, delete-aware CDC, HA, or exactly-once guarantee. Hard deletes and updates older than lookback need source-aware reconciliation.

## Supported deployment shape

Two private repo-backed services select `tech-progress/dlt-rest-postgres`, branch `release-v1`, root `/`, after source-access verification: `dlt Loader` and the least-privilege `Postgres` wrapper. One Postgres-only 5000 MB mount lives at `/var/lib/postgresql/data`; the loader has no volume. No public domains/TCP proxies are part of the recipe. The loader exits using `python pipeline.py`, hourly UTC `0 * * * *`, one replica, restart policy `NEVER`, and no HTTP health check or Start Command override.

Required empty user inputs `SOURCE_BASE_URL` and `SOURCE_API_TOKEN` need the actual HTTPS API base URL and actual upstream read-only bearer token. Neither is generated. Blank values fail closed. Database administrator and `dlt_loader` secrets are independently generated nonempty values; the loader receives only its secret and cannot administer roles/databases, replicate, or write public/unrelated schemas. `ALLOW_INSECURE_SOURCE=true` is for local fixture qualification only.

## Incident evidence and recovery

Record template/dlt/PostgreSQL versions and source commit, sanitized request/response schema, last completed load/watermark, expected/current counts, exit status, scratch/destination disk, and changed identities. Read exact pins from [pyproject.toml](pyproject.toml), [uv.lock](uv.lock), [Dockerfile](Dockerfile), and [Dockerfile.postgres](Dockerfile.postgres). Do not publish tokens, passwords, raw orders, resolved IaC/draft exports, backup files, or full sensitive exception logs.

Investigate API auth, timeouts/rate limits, inclusive filtering, timestamps, and stable pagination first; then locks, schema drift, grants, staging space, and `_dlt_loads`. Build/deployment success or database readiness does not prove completion: inspect exit status, completed loads, and [sql/reconciliation.sql](sql/reconciliation.sql). Alert separately on missing/failed hourly runs. Never remove `_dlt_pipeline_state` or change pipeline/dataset identities as an incident workaround without a reviewed backfill plan and whole-database backup. Discarded pending packages require replayable upstream records.

Use [UPGRADE.md](UPGRADE.md) for data/state restoration and credential rotation, [README.md](README.md) for every variable, and [PUBLISHING.md](PUBLISHING.md) for qualification/publication gates. Reports require independent read-only database roles. A volume is persistence, not backup or HA.

Cleanup follows standard deletion plus verified zero compute and disclosed retention; verify zero running/transitional instances and zero queued work for owned qualification resources. Physical storage deletion and billing-zero proof are not publication gates. A finite source-only permission/default review does not clear the assembled image. [LICENSE](LICENSE) covers newly authored recipe code only; [LICENSE_REVIEW.md](LICENSE_REVIEW.md) preserves upstream context and grants no combined-runtime security clearance.
