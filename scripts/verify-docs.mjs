import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const read = filename => readFileSync(new URL(filename, root), 'utf8');
const releaseDocuments = ['README.md', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md'];
const publicDocuments = [...releaseDocuments, 'CHANGELOG.md'];
const origins = ['https://github.com/dlt-hub/dlt', 'https://www.postgresql.org'];
const services = ['Postgres', 'dlt Loader'];
const publicLinkTargets = new Set([
  ...publicDocuments, 'VERSION', 'LICENSE', 'LICENSE_REVIEW.md', 'pyproject.toml', 'uv.lock',
  'Dockerfile', 'Dockerfile.postgres', 'template-defaults.json', '.env.example',
  '.railway/railway.ts', 'sql/reconciliation.sql',
]);

export function loadDocumentation() {
  return {
    version: read('VERSION').trim(),
    metadata: JSON.parse(read('marketplace-metadata.json')),
    defaults: JSON.parse(read('template-defaults.json')),
    networking: JSON.parse(read('template-networking.json')),
    volumes: JSON.parse(read('template-volumes.json')),
    railwaySource: read('.railway/railway.ts'),
    pipeline: read('pipeline.py'),
    databaseInit: read('sql/init-loader.sh'),
    dockerfile: read('Dockerfile'),
    project: read('pyproject.toml'),
    documents: Object.fromEntries(publicDocuments.map(filename => [filename, read(filename)])),
  };
}

export function verifyDocumentation(input, {
  checkVersion = true,
  publicFileExists = filename => existsSync(new URL(filename, root)),
} = {}) {
  const { version, metadata, defaults, networking, volumes, railwaySource, pipeline,
    databaseInit, dockerfile, project, documents } = input;
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'VERSION: SemVer required');
  for (const filename of publicDocuments) {
    assert.equal(typeof documents[filename], 'string', `${filename}: public document required`);
  }
  const releases = releaseDocuments.map(filename => {
    const text = documents[filename];
    const pattern = filename === 'README.md'
      ? /The current template release is `v([\d.]+)`/g
      : /Template release \*\*v([\d.]+)\*\*/g;
    const declarations = [...text.matchAll(pattern)];
    assert.equal(declarations.length, 1, `${filename}: one release declaration required`);
    if (checkVersion) assert.equal(declarations[0][1], version, `${filename}: release must match VERSION`);
    for (const phrase of ['[VERSION](VERSION)', 'A source release does not prove marketplace publication',
      'This release must be qualified independently.']) {
      assert.ok(text.includes(phrase), `${filename}: release qualification boundary ${phrase} required`);
    }
    assert.match(text, /historical local evidence for [*]*v1\.0\.0 \(2026-10-02\)/i, `${filename}: historical local evidence must be identified`);
    assert.match(text, /does not establish current live qualification or observed hourly Railway scheduler firing/i, `${filename}: current live qualification limit required`);
    for (const coordinate of ['tech-progress/dlt-rest-postgres', '`release-v1`', 'root `/`']) {
      assert.ok(text.includes(coordinate), `${filename}: standalone source coordinates required`);
    }
    return declarations[0][1];
  });
  assert.equal(new Set(releases).size, 1, 'release documents: declarations must agree');
  const changelogVersion = checkVersion ? version : releases[0];
  assert.match(documents['CHANGELOG.md'], new RegExp(`^## \\[${changelogVersion.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'), 'CHANGELOG.md: release entry required');

  const readme = documents['README.md'];
  assert.match(readme, /unpublished marketplace candidate/, 'unpublished marketplace status required');
  const rowFor = key => readme.split('\n').find(line => line.startsWith('| ') && line.includes('`' + key + '`'));
  assert.deepEqual(Object.keys(defaults).sort(), services, 'two-service defaults required');
  for (const [service, variables] of Object.entries(defaults)) {
    for (const [key, value] of Object.entries(variables)) {
      const row = rowFor(key);
      assert.ok(row, `README.md: graph variable ${key} required in table`);
      if (!value.startsWith('${{secret(') && value !== '') {
        assert.ok(row.includes('`' + value + '`'), `README.md: documented default ${service}.${key} must match graph`);
      }
    }
  }
  for (const key of ['SOURCE_BASE_URL', 'SOURCE_API_TOKEN']) {
    assert.equal(defaults['dlt Loader'][key], '', `${key}: required empty user input, not generated`);
    const row = rowFor(key);
    assert.match(row, /Required empty user input/, `${key}: document required empty user input`);
    assert.match(row, key === 'SOURCE_BASE_URL' ? /actual HTTPS API base URL/ : /actual upstream read-only bearer token; not generated/, `${key}: document actual upstream input`);
  }
  for (const key of ['POSTGRES_PASSWORD', 'DLT_LOADER_PASSWORD']) {
    assert.match(defaults.Postgres[key], /^\$\{\{secret\([1-9]\d*, "[a-zA-Z0-9]+"\)\}\}$/, `${key}: positive generated database secret required`);
    assert.match(rowFor(key), /nonempty independently generated/, `${key}: document independent generated database secret`);
  }
  assert.equal(defaults['dlt Loader'].PGPASSWORD, '${{Postgres.DLT_LOADER_PASSWORD}}', 'loader must reference dedicated database secret');
  assert.equal(defaults['dlt Loader'].PGUSER, 'dlt_loader', 'loader must use nonsuperuser role');
  assert.equal(defaults['dlt Loader'].ALLOW_INSECURE_SOURCE, 'false', 'HTTPS must remain default');
  assert.deepEqual(Object.keys(networking).sort(), services, 'two private services required');
  for (const service of Object.values(networking)) {
    assert.equal(service.publicPort, null, 'private networking: no public port');
    assert.deepEqual(service.tcpProxies, [], 'private networking: no TCP proxies');
  }
  assert.deepEqual(Object.keys(volumes), ['Postgres'], 'Postgres-only single volume required');
  assert.equal(volumes.Postgres.sizeMB, 5000, '5000 MB volume required');
  assert.equal(volumes.Postgres.mountPath, '/var/lib/postgresql/data', 'database mount required');
  assert.equal([...railwaySource.matchAll(/source: github\(repo, \{ branch, rootDirectory \}\)/g)].length, 2, 'two repo-backed source services required');
  assert.match(railwaySource, /dockerfilePath: "Dockerfile.postgres"/, 'repo-backed database wrapper required');
  assert.match(railwaySource, /cronSchedule: "0 \* \* \* \*", restartPolicyType: "NEVER", numReplicas: 1/, 'hourly UTC/NEVER/one-replica source required');
  for (const key of ['POSTGRES_PASSWORD', 'DLT_LOADER_PASSWORD']) {
    assert.match(railwaySource, new RegExp(`${key}: \\{ generator: defaults\\.Postgres\\.${key}\\.slice\\(3, -2\\), preserveExisting: true \\}`), `${key}: independent preserved generator required`);
  }
  assert.match(databaseInit, /CREATE ROLE dlt_loader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION/, 'least-privilege loader role required');
  assert.match(databaseInit, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/, 'public schema creation must be denied');
  for (const schema of ['rest_warehouse', 'rest_warehouse_staging']) {
    assert.ok(databaseInit.includes(`CREATE SCHEMA ${schema} AUTHORIZATION dlt_loader`), 'loader schema scope required');
  }
  assert.match(dockerfile, /CMD \["python", "pipeline.py"\]/, 'native loader startup required');
  assert.match(project, /dlt\[postgres\]==1\.30\.0/, 'dlt 1.30.0 dependency required');

  for (const filename of releaseDocuments) {
    const text = documents[filename];
    const plain = text.replaceAll('**', '').replaceAll('`', '');
    for (const literal of ['5000 MB', '`0 * * * *`', '`NEVER`', '`python pipeline.py`']) {
      assert.ok(text.includes(literal), `${filename}: runtime default ${literal} required`);
    }
    assert.match(text, /two private repo-backed services/i, `${filename}: private repo-backed topology required`);
    assert.match(text, /hourly UTC/i, `${filename}: UTC schedule required`);
    assert.match(text, /least-privilege|nonsuperuser/i, `${filename}: role boundary required`);
    for (const field of ['id', 'updated_at', 'amount_cents', 'page_number', 'data', 'total_pages', 'updated_since', 'merge']) {
      assert.ok(text.includes('`' + field + '`'), `${filename}: orders schema ${field} required`);
    }
    assert.match(plain, /Unix[- ]seconds?/i, `${filename}: Unix-second cursor required`);
    assert.match(plain, /(?:start\w* at 1|base_page=1)/i, `${filename}: pages must start at one`);
    assert.match(plain, /inclusive/, `${filename}: inclusive filtering required`);
    assert.match(plain, /3600[\s\S]*lookback|lookback[\s\S]*3600/, `${filename}: default lookback required`);
    for (const key of ['SOURCE_BASE_URL', 'SOURCE_API_TOKEN']) {
      assert.ok(text.includes('`' + key + '`'), `${filename}: required source inputs must be named`);
    }
    assert.match(plain, /required empty user inputs/i, `${filename}: required empty source inputs boundary`);
    assert.match(plain, /actual HTTPS API base URL/, `${filename}: actual HTTPS source required`);
    assert.match(plain, /actual upstream read-only bearer token/, `${filename}: actual read-only token required`);
    assert.match(plain, /authenticated synthetic fixture is qualification only/i, `${filename}: fixture-only qualification boundary required`);
    assert.match(plain, /real[- ]provider/, `${filename}: real-provider scope boundary required`);
    for (const boundary of ['arbitrary REST', 'delete-aware CDC', 'HA', 'exactly-once']) {
      assert.ok(plain.includes(boundary), `${filename}: scope boundary ${boundary} required`);
    }
    assert.match(plain, /standard deletion plus verified zero compute and disclosed retention/i, `${filename}: accepted cleanup policy required`);
    assert.match(plain, /physical storage deletion and billing-zero proof are not publication gates/i, `${filename}: physical-erasure/billing boundary required`);
    assert.match(plain, /finite source-only permission\/default review does not clear the assembled image/i, `${filename}: source-only review boundary required`);
  }
  assert.match(readme, /MIT for newly authored recipe code only/, 'recipe-only MIT boundary required');
  assert.match(readme, /does not relabel combined runtime binaries or grant security clearance/, 'combined-runtime/security boundary required');
  assert.match(readme, /Unfinished local packages are not recovered/, 'unfinished-package recovery boundary required');
  assert.match(readme, /Hard deletes remain in the warehouse/, 'hard-delete limit required');
  assert.match(readme, /Changing `SOURCE_INITIAL_CURSOR` alone does not reset existing state/, 'initial cursor is not a reset required');
  const example = readme.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(example, 'README.md: response example required');
  const response = JSON.parse(example[1]);
  assert.ok(Array.isArray(response.data) && Number.isInteger(response.total_pages), 'README.md: data/total_pages response shape required');
  assert.ok(response.data.length > 0, 'README.md: example order required');
  for (const key of ['id', 'updated_at', 'amount_cents']) {
    assert.ok(Number.isInteger(response.data[0][key]), `README.md: example ${key} must be integer`);
  }
  for (const contract of ['"type": "page_number", "base_page": 1, "total_path": "total_pages"',
    '"data_selector": "data"', '"primary_key": "id"', '"write_disposition": "merge"',
    '"cursor_path": "updated_at"', '"start_param": "updated_since"', '"lag": lookback']) {
    assert.ok(pipeline.includes(contract), 'pipeline orders contract must match docs');
  }

  assert.deepEqual(metadata.origins.map(origin => origin.url).sort(), [...origins].sort(), 'both main upstream metadata origins required');
  for (const filename of ['README.md', 'MARKETPLACE.md']) {
    for (const origin of origins) {
      assert.ok(documents[filename].includes(origin), `${filename}: main upstream URL required`);
    }
  }
  assert.ok(metadata.description.length >= 45 && metadata.description.length <= 75, 'marketplace description must be 45–75 characters');
  assert.ok(documents['MARKETPLACE.md'].includes(metadata.description), 'marketplace description must match metadata');
  assert.deepEqual(documents['MARKETPLACE.md'].match(/^#{1,3} .+$/gm), [
    `# Deploy and Host ${metadata.name} on Railway`,
    `## About Hosting ${metadata.name}`,
    `## Why Deploy ${metadata.name} on Railway`,
    '## Common Use Cases',
    `## Dependencies for ${metadata.name}`,
    '### Deployment Dependencies',
  ], 'six exact marketplace headings required');
  assert.ok(!Object.hasOwn(metadata, 'id') && !Object.hasOwn(metadata, 'code'), 'no candidate publication identifiers allowed');

  const publishing = documents['PUBLISHING.md'];
  for (const phrase of ['queried stored graph', 'existing UNPUBLISHED draft', 'templateDeployV2',
    'zero running/transitional instances', 'zero queued work',
    'node scripts/verify-docs.mjs', 'node --test tests/docs.test.mjs',
    'scripts/sync-template-marketplace.sh dlt-rest-postgres', 'scripts/audit-template-marketplace.sh',
    "Standard deletion plus verified zero compute and disclosed retention satisfies the owner's cleanup policy."]) {
    assert.ok(publishing.includes(phrase), `PUBLISHING.md: required gate ${phrase}`);
  }
  const requiredLinks = {
    'README.md': ['VERSION', 'PUBLISHING.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE_REVIEW.md', 'Dockerfile.postgres'],
    'PUBLISHING.md': ['README.md', 'LICENSE', 'LICENSE_REVIEW.md', 'MARKETPLACE.md', 'SUPPORT.md', 'UPGRADE.md', 'CHANGELOG.md'],
    'MARKETPLACE.md': ['README.md', 'PUBLISHING.md', 'SUPPORT.md', 'UPGRADE.md'],
    'SUPPORT.md': ['README.md', 'PUBLISHING.md', 'UPGRADE.md'],
    'UPGRADE.md': ['README.md', 'PUBLISHING.md', 'SUPPORT.md', 'CHANGELOG.md'],
  };
  for (const [filename, text] of Object.entries(documents)) {
    assert.doesNotMatch(text, /FINDINGS\.md|\.verification\b|worker\d|\/tmp\/(?!dlt-pipelines(?:[`\s,]|$))|\/home\/|file:\/\/|\.\.\//i, `${filename}: private evidence/path references must not be distributed`);
    assert.doesNotMatch(text, /no (?:public |standalone )?source (?:exists|has been)|no distribution repository|owner (?:license|licensing) (?:approval|permission) (?:pending|required)|unknown source|unlicensed recipe/i, `${filename}: stale source/owner-license wording`);
    assert.doesNotMatch(text, /railway\.com\/deploy\/|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, `${filename}: invented publication identifiers forbidden`);
    assert.doesNotMatch(text, /(?:wait (?:at least )?48 hours|physical (?:erasure|deletion) required|billing[- ]zero required)/i, `${filename}: superseded cleanup gate`);
    assert.doesNotMatch(text, /this release is (?:fully qualified|published|security cleared)|(?:guarantees|provides) exactly[- ]once|supports arbitrary REST|fixture is (?:the )?default source|all dependencies are MIT/i, `${filename}: unearned qualification/scope claim`);
    assert.doesNotMatch(text, /(?:PostgreSQL|postgres:)\s*`?\d+\.\d+/, `${filename}: link authoritative PostgreSQL pins instead of duplicating patch versions`);
    const targets = new Set();
    for (const link of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = link[1].split('#')[0];
      if (!target || /^https?:\/\//i.test(target)) continue;
      assert.ok(publicLinkTargets.has(target), `${filename}: link must target distributed public files`);
      assert.ok(publicFileExists(target), `${filename}: missing public link target ${target}`);
      targets.add(target);
    }
    for (const target of requiredLinks[filename] ?? []) {
      assert.ok(targets.has(target), `${filename}: required public doc link ${target}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const checkVersion = !process.argv.includes('--skip-version');
  verifyDocumentation(loadDocumentation(), { checkVersion });
  console.log(`PASS: public docs, private topology, required inputs, orders schema, links, marketplace and qualification boundaries${checkVersion ? ', including VERSION agreement' : '; VERSION agreement deferred for release-owner update'}. Static checks only.`);
}
