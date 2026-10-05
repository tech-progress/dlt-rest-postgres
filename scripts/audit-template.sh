#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
draft="${1:?Usage: audit-template.sh EXPORTED_RESTORED_DRAFT.json}"
graph="$(mktemp)"
trap 'rm -f "$graph"' EXIT
(cd "$root" && ./node_modules/.bin/railway-iac-ts .railway/railway.ts) > "$graph"
python3 "$root/scripts/draft.py" audit "$draft" "$graph"
