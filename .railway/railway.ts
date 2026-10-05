import { readFileSync } from "node:fs";
import { defineRailway, github, group, project, service, volume } from "railway/iac";

function sourceSetting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; select an actual accessible repository/release branch`);
  return value;
}

const repo = sourceSetting("TEMPLATE_SOURCE_REPO");
const branch = sourceSetting("TEMPLATE_SOURCE_BRANCH");
const rootDirectory = process.env.TEMPLATE_SOURCE_ROOT_DIR ?? "/dlt-rest-postgres";
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || branch.includes("/") || !rootDirectory.startsWith("/")) {
  throw new Error("Use owner/repository, a slash-free branch, and an absolute repository root directory");
}
const defaults = JSON.parse(readFileSync(new URL("../template-defaults.json", import.meta.url), "utf8"));
export default defineRailway(() => {
  const data = volume("Warehouse Data", { sizeMB: 5000 });
  const database = service("Postgres", {
    source: github(repo, { branch, rootDirectory }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.postgres" },
    volumeMounts: { "/var/lib/postgresql/data": data },
    networking: { serviceDomains: {}, tcpProxies: {} },
    env: { ...defaults.Postgres,
      POSTGRES_PASSWORD: { generator: defaults.Postgres.POSTGRES_PASSWORD.slice(3, -2), preserveExisting: true },
      DLT_LOADER_PASSWORD: { generator: defaults.Postgres.DLT_LOADER_PASSWORD.slice(3, -2), preserveExisting: true },
    },
  });
  const loader = service("dlt Loader", {
    source: github(repo, { branch, rootDirectory }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile", watchPatterns: ["/**", "!/FINDINGS.md"] },
    deploy: { cronSchedule: "0 * * * *", restartPolicyType: "NEVER", numReplicas: 1 },
    networking: { serviceDomains: {}, tcpProxies: {} },
    env: defaults["dlt Loader"],
  });
  return project("dlt REST Postgres", { resources: [group("Ingestion", [loader]), group("Storage", [database, data])] });
});
