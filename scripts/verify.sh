#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for file in .env.example .dockerignore .gitignore .railway/railway.ts package.json package-lock.json pyproject.toml uv.lock Dockerfile Dockerfile.postgres compose.yaml pipeline.py sql/reconciliation.sql sql/init-loader.sh VERSION CHANGELOG.md README.md MARKETPLACE.md PUBLISHING.md SUPPORT.md UPGRADE.md LICENSE LICENSE_REVIEW.md THIRD_PARTY_NOTICES.md licenses/psycopg2-LICENSE.txt licenses/psycopg2-COPYING.LESSER.txt FINDINGS.md marketplace-metadata.json template-defaults.json template-descriptions.json template-networking.json template-volumes.json scripts/draft.py scripts/restore-template-draft.sh scripts/audit-template.sh scripts/smoke.sh scripts/smoke.py scripts/build.sh scripts/start.sh scripts/verify-runtime.py scripts/verify-docs.mjs tests/docs.test.mjs tests/test_configuration.py tests/test_draft.py tests/fixture.py; do
  if [[ "${PUBLIC_DISTRIBUTION:-0}" == 1 && "$file" =~ ^(FINDINGS|LICENSE_REVIEW|PUBLISHING).md$ ]]; then continue; fi
  test -f "$file" || { echo "Missing $file" >&2; exit 1; }
done
version="$(cat VERSION)"
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
grep -Fq "## [$version] - " CHANGELOG.md
for file in scripts/*.sh; do bash -n "$file"; done
uv lock --check
uv run --frozen python -m unittest discover -s tests -v
node --test tests/docs.test.mjs
node scripts/verify-docs.mjs
POSTGRES_PASSWORD=validation-only DLT_LOADER_PASSWORD=validation-only SOURCE_API_TOKEN=validation-only SOURCE_BASE_URL=https://api.example.test docker compose config --quiet
graph="$(mktemp)"
trap 'rm -f "$graph"' EXIT
./node_modules/.bin/railway-iac-ts .railway/railway.ts > "$graph"
python3 - "$graph" <<'PY'
import json, pathlib, sys
root = pathlib.Path('.')
metadata = json.loads((root / 'marketplace-metadata.json').read_text())
assert 45 <= len(metadata['description']) <= 75
assert not any(key in metadata for key in ('id', 'code', 'distributionRepo'))
defaults = json.loads((root / 'template-defaults.json').read_text())
descriptions = json.loads((root / 'template-descriptions.json').read_text())
for name, variables in defaults.items():
    assert set(variables) == set(descriptions[name])
    for key in variables:
        assert key in (root / 'README.md').read_text() and key in (root / '.env.example').read_text(), key
for origin in metadata['origins']:
    assert origin['url'] in (root / 'README.md').read_text()
resources = json.load(open(sys.argv[1]))['graph']['resources']
services = {resource['name']: resource for resource in resources if resource['type'] == 'service'}
assert set(services) == set(defaults)
assert services['dlt Loader']['deploy'] == {'cronSchedule': '0 * * * *', 'restartPolicyType': 'NEVER', 'numReplicas': 1}
for name, resource in services.items():
    assert not resource.get('networking', {}).get('serviceDomains')
    for key, value in resource['variables'].items():
        if defaults[name][key].startswith('${{secret('):
            assert value['type'] == 'raw' and value['value']['generator'] == defaults[name][key][3:-2] and value['value']['preserveExisting'], f'{name}.{key} invalid generator'
        else:
            assert value['type'] == 'literal' and isinstance(value['value'], str), f'{name}.{key} invalid SDK variable shape'
assert len([resource for resource in resources if resource['type'] == 'volume']) == 1
assert not services['dlt Loader'].get('volumeAttachments')
assert len(services['Postgres']['volumeAttachments']) == 1
assert 'name = "dlt"\nversion = "1.30.0"' in (root / 'uv.lock').read_text()
assert 'name = "psycopg2"\nversion = "2.9.13"' in (root / 'uv.lock').read_text()
assert 'name = "psycopg2-binary"' not in (root / 'uv.lock').read_text()
assert (root / 'Dockerfile.postgres').read_text().startswith('FROM postgres:17.11-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652\n')
assert json.loads((root / 'package-lock.json').read_text())['packages']['node_modules/railway']['version'] == '3.6.0'
for heading in ('# Deploy and Host', '## About Hosting', '## Why Deploy', '## Common Use Cases', '## Dependencies for', '### Deployment Dependencies'):
    assert heading in (root / 'MARKETPLACE.md').read_text()
assert not (root / '.env').exists()
print('PASS: local structure, dependency locks, version, marketplace copy, required variables, graph and private topology')
PY
