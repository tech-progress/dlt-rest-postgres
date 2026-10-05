import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDocumentation, verifyDocumentation } from '../scripts/verify-docs.mjs';

const documentation = loadDocumentation();
const options = { checkVersion: process.env.DLT_DOCS_SKIP_VERSION !== '1' };
const changedDocument = (filename, transform) => ({
  ...documentation,
  documents: { ...documentation.documents, [filename]: transform(documentation.documents[filename]) },
});
const rejectsChange = (filename, transform, message) => {
  assert.throws(() => verifyDocumentation(changedDocument(filename, transform), options), message);
};
const mutate = transform => {
  const candidate = structuredClone(documentation);
  transform(candidate);
  return candidate;
};

test('public docs preserve runtime, API and qualification boundaries', () => {
  verifyDocumentation(documentation, options);
});

test('requires VERSION agreement and coherent release docs during owner update', () => {
  const release = documentation.documents['README.md'].match(/current template release is `v([\d.]+)`/)[1];
  verifyDocumentation({ ...documentation, version: release });
  assert.throws(() => verifyDocumentation({ ...documentation, version: '0.0.0' }), /release must match VERSION/);
  assert.throws(() => verifyDocumentation({ ...documentation, version: 'bad' }, { checkVersion: false }), /SemVer required/);
  assert.throws(() => verifyDocumentation(changedDocument('SUPPORT.md', text => text.replace(`v${release}`, 'v0.0.0')), { checkVersion: false }), /declarations must agree/);
  rejectsChange('CHANGELOG.md', text => text.replace(`## [${release}]`, '## [0.0.0]'), /release entry required/);
});

test('requires public documents and links, retaining LICENSE_REVIEW only when present', () => {
  assert.throws(() => verifyDocumentation(mutate(input => delete input.documents['SUPPORT.md']), options), /public document required/);
  rejectsChange('README.md', text => text.replace('[SUPPORT.md](SUPPORT.md)', 'SUPPORT.md'), /required public doc link SUPPORT/);
  rejectsChange('README.md', text => `${text}\n[Missing](missing-guide.md)\n`, /distributed public files/);
  rejectsChange('README.md', text => `${text}\n[Root](../README.md)\n`, /private evidence\/path/);
  verifyDocumentation(changedDocument('README.md', text => `${text}\n[License](LICENSE_REVIEW.md#review)\n`), options);
  assert.throws(() => verifyDocumentation(documentation, {
    ...options, publicFileExists: filename => filename !== 'LICENSE_REVIEW.md',
  }), /missing public link target LICENSE_REVIEW/);
});

test('requires both main origins and six marketplace headings/description', () => {
  for (const origin of documentation.metadata.origins) {
    for (const filename of ['README.md', 'MARKETPLACE.md']) {
      rejectsChange(filename, text => text.replaceAll(origin.url, 'https://example.invalid/'), /main upstream URL/);
    }
  }
  assert.throws(() => verifyDocumentation(mutate(input => input.metadata.origins.pop()), options), /both main upstream/);
  for (const heading of documentation.documents['MARKETPLACE.md'].match(/^#{1,3} .+$/gm)) {
    rejectsChange('MARKETPLACE.md', text => text.replace(heading, `${heading} extra`), /six exact marketplace headings/);
  }
  rejectsChange('MARKETPLACE.md', text => text.replace(documentation.metadata.description, 'Generic hosting.'), /description must match/);
  assert.throws(() => verifyDocumentation(mutate(input => input.metadata.description = 'Short'), options), /45–75/);
});

test('rejects private evidence paths, stale source/license wording and fake identifiers', () => {
  for (const filename of Object.keys(documentation.documents)) {
    for (const reference of ['[Internal](FINDINGS.md)', '/tmp/receipt.log', '/home/operator/evidence.json', '.verification/result.json']) {
      rejectsChange(filename, text => `${text}\n${reference}\n`, /private evidence\/path/);
    }
    for (const claim of ['No standalone source exists.', 'Unknown source.', 'Owner license approval pending.']) {
      rejectsChange(filename, text => `${text}\n${claim}\n`, /stale source\/owner-license/);
    }
    rejectsChange(filename, text => `${text}\nhttps://railway.com/deploy/FAKECODE\n`, /invented publication identifiers/);
  }
  assert.throws(() => verifyDocumentation(mutate(input => input.metadata.code = 'FAKECODE'), options), /no candidate publication identifiers/);
});

test('rejects standalone source drift and missing historical/live qualification limits', () => {
  rejectsChange('README.md', text => text.replace('unpublished marketplace candidate', 'published template'), /unpublished marketplace status/);
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    rejectsChange(filename, text => text.replaceAll('tech-progress/dlt-rest-postgres', 'owner/other'), /standalone source coordinates/);
    rejectsChange(filename, text => text.replaceAll('`release-v1`', '`main`'), /standalone source coordinates/);
    rejectsChange(filename, text => text.replaceAll('root `/`', 'root `/dlt-rest-postgres`'), /standalone source coordinates/);
    rejectsChange(filename, text => text.replaceAll(/historical local evidence for/gi, 'Latest proof for'), /historical local evidence/);
    rejectsChange(filename, text => text.replaceAll(/does not establish current live qualification or observed hourly Railway scheduler firing/gi, 'proves qualification'), /current live qualification limit/);
    rejectsChange(filename, text => text.replace('This release must be qualified independently.', 'This release is ready.'), /release qualification boundary/);
  }
});

test('rejects public exposure, wrong volumes and schedule/default drift', () => {
  for (const service of ['Postgres', 'dlt Loader']) {
    assert.throws(() => verifyDocumentation(mutate(input => input.networking[service].publicPort = 5432), options), /no public port/);
    assert.throws(() => verifyDocumentation(mutate(input => input.networking[service].tcpProxies.push({ port: 5432 })), options), /no TCP proxies/);
  }
  assert.throws(() => verifyDocumentation(mutate(input => input.volumes['dlt Loader'] = input.volumes.Postgres), options), /Postgres-only single volume/);
  assert.throws(() => verifyDocumentation(mutate(input => input.volumes.Postgres.sizeMB = 1000), options), /5000 MB volume/);
  assert.throws(() => verifyDocumentation(mutate(input => input.railwaySource = input.railwaySource.replace('restartPolicyType: "NEVER"', 'restartPolicyType: "ALWAYS"')), options), /hourly UTC\/NEVER/);
  assert.throws(() => verifyDocumentation(mutate(input => input.railwaySource = input.railwaySource.replace('source: github(repo, { branch, rootDirectory })', 'source: image("postgres")')), options), /two repo-backed/);
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    rejectsChange(filename, text => text.replaceAll('`0 * * * *`', '`* * * * *`'), /runtime default/);
    rejectsChange(filename, text => text.replaceAll('`NEVER`', '`ALWAYS`'), /runtime default/);
    rejectsChange(filename, text => text.replaceAll(/5000 MB/g, '1000 MB'), /runtime default/);
  }
  for (const key of Object.keys(documentation.defaults['dlt Loader'])) {
    rejectsChange('README.md', text => text.replaceAll('`' + key + '`', '`UNDOCUMENTED`'), /graph variable/);
  }
});

test('requires actual empty API inputs and positive independent database generators', () => {
  for (const key of ['SOURCE_BASE_URL', 'SOURCE_API_TOKEN']) {
    for (const value of ['https://example.invalid/', '${{secret(32, "abc")}}']) {
      assert.throws(() => verifyDocumentation(mutate(input => input.defaults['dlt Loader'][key] = value), options), /documented default|required empty user input/);
    }
  }
  rejectsChange('README.md', text => text.replaceAll('Required empty user input', 'Optional input'), /document required empty user input/);
  rejectsChange('README.md', text => text.replaceAll('actual upstream read-only bearer token; not generated', 'generated token'), /document actual upstream input/);
  for (const key of ['POSTGRES_PASSWORD', 'DLT_LOADER_PASSWORD']) {
    for (const value of ['', '${{secret(0, "abc")}}']) {
      assert.throws(() => verifyDocumentation(mutate(input => input.defaults.Postgres[key] = value), options), /positive generated database secret/);
    }
    assert.throws(() => verifyDocumentation(mutate(input => input.railwaySource = input.railwaySource.replace(`generator: defaults.Postgres.${key}.slice(3, -2)`, 'generator: "shared-secret"')), options), /independent preserved generator/);
  }
  assert.throws(() => verifyDocumentation(mutate(input => input.defaults['dlt Loader'].PGPASSWORD = '${{Postgres.POSTGRES_PASSWORD}}'), options), /documented default|dedicated database secret/);
  assert.throws(() => verifyDocumentation(mutate(input => input.databaseInit = input.databaseInit.replace('NOSUPERUSER', 'SUPERUSER')), options), /least-privilege/);
});

test('rejects orders schema drift in docs, sample payload and implementation', () => {
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    for (const key of ['id', 'updated_at', 'amount_cents', 'page_number', 'data', 'total_pages', 'updated_since', 'merge']) {
      rejectsChange(filename, text => text.replaceAll('`' + key + '`', '`wrong_field`'), /orders schema/);
    }
    rejectsChange(filename, text => text.replaceAll(/Unix[- ]seconds?/gi, 'ISO timestamps'), /Unix-second cursor/);
    rejectsChange(filename, text => text.replaceAll('inclusive', 'exclusive'), /inclusive filtering/);
  }
  rejectsChange('README.md', text => text.replace('"amount_cents":1200', '"amount_cents":"1200"'), /example amount_cents must be integer/);
  rejectsChange('README.md', text => text.replace('"total_pages":1', '"page_count":1'), /data\/total_pages response shape/);
  assert.throws(() => verifyDocumentation(mutate(input => input.pipeline = input.pipeline.replace('"base_page": 1', '"base_page": 0')), options), /pipeline orders contract/);
});

test('preserves scratch/replay limits and forbids unsupported scope claims', () => {
  rejectsChange('README.md', text => text.replace('Unfinished local packages are not recovered', 'Unfinished packages are durable'), /unfinished-package recovery/);
  rejectsChange('README.md', text => text.replace('Hard deletes remain in the warehouse', 'Hard deletes propagate'), /hard-delete limit/);
  rejectsChange('README.md', text => text.replace('Changing `SOURCE_INITIAL_CURSOR` alone does not reset existing state', 'Initial cursor resets existing state'), /initial cursor is not a reset/);
  for (const filename of Object.keys(documentation.documents)) {
    for (const claim of ['This release is fully qualified.', 'Provides exactly-once ingestion.', 'Supports arbitrary REST.', 'Fixture is the default source.', 'All dependencies are MIT.']) {
      rejectsChange(filename, text => `${text}\n${claim}\n`, /unearned qualification\/scope claim/);
    }
  }
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    rejectsChange(filename, text => text.replaceAll(/authenticated synthetic fixture is qualification only/gi, 'Synthetic fixture is deployed'), /fixture-only qualification/);
  }
});

test('requires queried graph, shared publication checks and accepted cleanup policy', () => {
  for (const phrase of ['queried stored graph', 'existing UNPUBLISHED draft', 'templateDeployV2',
    'zero running/transitional instances', 'zero queued work', 'scripts/sync-template-marketplace.sh dlt-rest-postgres', 'scripts/audit-template-marketplace.sh']) {
    rejectsChange('PUBLISHING.md', text => text.replaceAll(phrase, 'omitted gate'), /required gate/);
  }
  rejectsChange('PUBLISHING.md', text => text.replace("Standard deletion plus verified zero compute and disclosed retention satisfies the owner's cleanup policy.", 'Cleanup optional.'), /accepted cleanup policy/);
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    rejectsChange(filename, text => text.replaceAll(/physical storage deletion and billing-zero proof are not publication gates/gi, 'Physical erasure required'), /physical-erasure\/billing boundary/);
  }
  rejectsChange('PUBLISHING.md', text => `${text}\nWait 48 hours for physical deletion before publication.\n`, /superseded cleanup gate/);
});

test('limits source permission/default review and links authoritative image pins', () => {
  rejectsChange('README.md', text => text.replace('MIT for newly authored recipe code only', 'MIT for all upstream code'), /recipe-only MIT/);
  rejectsChange('README.md', text => text.replace('does not relabel combined runtime binaries or grant security clearance', 'clears every binary'), /combined-runtime\/security/);
  for (const filename of ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md']) {
    rejectsChange(filename, text => text.replaceAll(/finite source-only permission\/default review does not clear the assembled image/gi, 'All images cleared'), /source-only review/);
  }
  for (const filename of Object.keys(documentation.documents)) {
    rejectsChange(filename, text => `${text}\nPostgreSQL 17.9 is the current release pin.\n`, /authoritative PostgreSQL pins/);
  }
});
