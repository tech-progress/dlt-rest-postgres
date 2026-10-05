# Deploy and Host dlt REST Postgres on Railway

Paginated REST ingestion with merge loading and PostgreSQL state.

This copy describes an unpublished marketplace candidate; publication requires the independent gates below.

Template release **v1.0.1**; [VERSION](VERSION) is authoritative. A source release does not prove marketplace publication or live Railway qualification. This release must be qualified independently. Historical local evidence for v1.0.0 (2026-10-02) used authenticated synthetic orders and does not establish current live qualification or observed hourly Railway scheduler firing.

## About Hosting dlt REST Postgres

Two private repo-backed services: an exiting `dlt Loader` and a least-privilege `Postgres` wrapper. Both select `tech-progress/dlt-rest-postgres`, branch `release-v1`, root `/`; verify real source access before deployment. Postgres alone has one 5000 MB mount at `/var/lib/postgresql/data`. The loader uses `python pipeline.py`, hourly UTC `0 * * * *`, one replica, and restart policy `NEVER`. No public domains/TCP proxies, loader volume, web UI, or default fixture is included.

## Why Deploy dlt REST Postgres on Railway

Keep order tables and completed pipeline state together behind private DNS. The schema-scoped nonsuperuser `dlt_loader` uses its independently generated database secret; the initialization/backup administrator has a distinct independently generated secret. Required empty user inputs `SOURCE_BASE_URL` and `SOURCE_API_TOKEN` need an actual HTTPS API base URL and actual upstream read-only bearer token; these are not generated credentials.

## Common Use Cases

- Import compatible orders for SQL reporting using `merge` keyed by integer `id`.
- Reconcile counts, unique IDs, integer-cent revenue, and source freshness.
- Replay bounded lookback and restore completed cursors after loader replacement.

## Dependencies for dlt REST Postgres

- [dlt](https://github.com/dlt-hub/dlt), pinned `1.30.0` with PostgreSQL destination support.
- [PostgreSQL](https://www.postgresql.org), using the immutable pin in [Dockerfile.postgres](Dockerfile.postgres).

### Deployment Dependencies

The source must implement `page_number` starting at 1 (`page`/`page_size`), a `data` array, `total_pages`, and inclusive `updated_since`. Orders require stable integer `id`, integer `updated_at` in Unix seconds, and integer `amount_cents`. Default lookback is 3600 seconds; records/pages must remain replayable/stable. This is a specific contract, not an arbitrary REST connector or real-provider adapter. The authenticated synthetic fixture is qualification only, never a default source. No delete-aware CDC, HA, or exactly-once guarantee is offered; hard deletes and changes older than lookback need source-aware reconciliation.

Read [README.md](README.md) for all variables and [PUBLISHING.md](PUBLISHING.md) for exact-source, image, queried-graph, live scheduler/workflow, and marketplace gates. Build success/readiness does not prove ingestion success. Backups must include data and `_dlt_*` state; see [UPGRADE.md](UPGRADE.md) and [SUPPORT.md](SUPPORT.md). Cleanup uses standard deletion plus verified zero compute and disclosed retention; physical storage deletion and billing-zero proof are not publication gates. A finite source-only permission/default review does not clear the assembled image; recipe licensing does not relicense upstream dependencies or grant security clearance.
