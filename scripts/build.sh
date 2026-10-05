#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
timeout 600 docker build --target runtime --tag "rt-dlt-rest-postgres:$(cat VERSION)" .
