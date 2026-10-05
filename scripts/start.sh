#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
timeout 120 docker compose up -d --wait --wait-timeout 90 postgres
timeout 600 docker compose run --rm loader
