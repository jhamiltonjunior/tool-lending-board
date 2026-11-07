// CI guard for the exported n8n workflows: valid JSON, expected shape, and no
// secrets pasted inline (they must come from the container env via $env).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "n8n/workflows";
const SECRET_LIKE = /\b[a-f0-9]{32,}\b|sha256=[a-f0-9]{16,}/i;
const ALLOWED_ENV = new Set(["LENDLOOP_WEBHOOK_SECRET", "LENDLOOP_CONVEX_SITE_URL"]);
let failed = false;

const fail = (file, msg) => {
  console.error(`::error file=${file}::${msg}`);
  failed = true;
};

for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const file = join(dir, name);
  const text = readFileSync(file, "utf8");
  let wf;
  try {
    wf = JSON.parse(text);
  } catch (e) {
    fail(file, `invalid JSON: ${e.message}`);
    continue;
  }
  if (!wf.id || !wf.name || !Array.isArray(wf.nodes) || typeof wf.connections !== "object") {
    fail(file, "missing id, name, nodes or connections");
  }
  if (SECRET_LIKE.test(text)) fail(file, "looks like a secret or signature is hard-coded");
  for (const [, envName] of text.matchAll(/\$env\.([A-Z0-9_]+)/g)) {
    if (!ALLOWED_ENV.has(envName)) fail(file, `unexpected env var $env.${envName}`);
  }
  for (const node of wf.nodes ?? []) {
    if (node.credentials) fail(file, `node "${node.name}" references stored credentials`);
  }
  console.log(`ok  ${file} (${wf.nodes?.length ?? 0} nodes)`);
}

process.exit(failed ? 1 : 0);
