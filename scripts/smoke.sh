#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export POSTGRES_PASSWORD="$(openssl rand -hex 24)" DLT_LOADER_PASSWORD="$(openssl rand -hex 24)" SOURCE_API_TOKEN="$(openssl rand -hex 24)"
export SOURCE_BASE_URL=http://fixture:8000/ ALLOW_INSECURE_SOURCE=true
project="rt-dlt-smoke-${$}"
temporary="$(mktemp -d -t rt-dlt-restore.XXXXXX)"
chmod 700 "$temporary"
compose=(docker compose --project-name "$project" --profile smoke)
cleanup() { "${compose[@]}" down --volumes --remove-orphans --timeout 10; rm -rf "$temporary"; }
trap cleanup EXIT
trap 'exit 143' INT TERM
timeout 600 "${compose[@]}" build postgres loader fixture smoke
timeout 120 "${compose[@]}" up -d --wait --wait-timeout 90 postgres fixture
timeout 180 "${compose[@]}" run --rm --no-deps loader
timeout 30 "${compose[@]}" run --rm --no-deps smoke python scripts/verify-runtime.py
timeout 60 "${compose[@]}" run --rm --no-deps smoke python -m unittest discover -s tests -v
timeout 600 "${compose[@]}" run --rm --no-deps smoke
timeout 60 "${compose[@]}" exec -T postgres pg_dump -U postgres -d warehouse --format=custom > "$temporary/warehouse.dump"
timeout 30 "${compose[@]}" stop fixture
if timeout 90 "${compose[@]}" run --rm --no-deps loader > "$temporary/source-unavailable.log" 2>&1; then
  echo 'Unavailable source unexpectedly succeeded' >&2; exit 1
fi
timeout 120 "${compose[@]}" up -d --wait --wait-timeout 90 fixture
timeout 30 "${compose[@]}" rm --stop --force postgres
timeout 15 docker volume rm "${project}_warehouse-data"
timeout 120 "${compose[@]}" up -d --wait --wait-timeout 90 postgres
timeout 60 "${compose[@]}" exec -T postgres pg_restore -U postgres -d warehouse --clean --if-exists --exit-on-error < "$temporary/warehouse.dump"
timeout 180 "${compose[@]}" run --rm --no-deps smoke python -c 'from scripts.smoke import assert_rows, fresh_run; assert_rows(101, 99900); fresh_run(); assert_rows(101, 99900)'
echo 'PASS: unavailable source fails, full destination backup restored into an empty volume, restored role/state/rows replay without duplicates'
mapfile -t containers < <("${compose[@]}" ps -q postgres fixture)
if (( ${#containers[@]} > 0 )); then
  timeout 30 docker stats --no-stream "${containers[@]}"
fi
cleanup
[[ -z "$(timeout 15 docker ps -aq --filter "label=com.docker.compose.project=$project")" ]]
[[ -z "$(timeout 15 docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]]
trap - EXIT
echo "PASS: own isolated smoke containers, network and volume removed"
