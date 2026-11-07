// Pushes the exported workflows to a running n8n through its public API and
// publishes them. First-time setup is a manual import (see README); this only
// updates workflows that already exist, so ids and error-workflow links stay stable.
//
// Usage: N8N_API_URL=https://n8n.example.com N8N_API_KEY=... node scripts/deploy-n8n-workflows.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.N8N_API_URL?.replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!base || !key) {
  console.error("N8N_API_URL and N8N_API_KEY are required");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// The error handler goes first: the other workflows point to it.
const files = readdirSync("n8n/workflows")
  .filter((f) => f.endsWith(".json"))
  .sort((a, b) => (a.startsWith("error") ? -1 : b.startsWith("error") ? 1 : a.localeCompare(b)));

for (const file of files) {
  const wf = JSON.parse(readFileSync(join("n8n/workflows", file), "utf8"));
  // The public API accepts only these fields on update.
  const { name, nodes, connections, settings } = wf;
  await api("PUT", `/workflows/${wf.id}`, { name, nodes, connections, settings });
  await api("POST", `/workflows/${wf.id}/activate`);
  console.log(`deployed ${wf.id} (${name})`);
}
