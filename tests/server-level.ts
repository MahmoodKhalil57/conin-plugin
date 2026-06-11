#!/usr/bin/env bun
// Workstream C.1 + C.4 — SERVER-LEVEL proof (no Claude): the Conin core is host-ready, and its two protocol-views
// (/mcp and /v1) are ONE core. Drives the live server with a scoped x-api-key (ADR 0020 A.3), so it runs unattended.
//
//   CONIN_TEST_KEY=ci_… bun tests/server-level.ts                         # against production
//   CONIN_BASE=http://localhost:8787 CONIN_TEST_KEY=ci_… bun tests/server-level.ts
//
// The key needs the `studies:read` scope (generate_deliverable is a studies:read op). Mint one in the web app.
// The unauthenticated handshake checks (instructions, initialize) run even WITHOUT a key.

const BASE = (process.env.CONIN_BASE ?? "https://construction-intelligence.saastemly.com").replace(/\/$/, "");
const KEY = process.env.CONIN_TEST_KEY ?? "";
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); } };

const rpc = async (method: string, params?: unknown) => {
  const r = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(KEY ? { "x-api-key": KEY } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};

console.log(`\n▶ Conin server-level proof @ ${BASE}${KEY ? "  (with key)" : "  (no key — handshake checks only)"}\n`);

// ── handshake (no auth needed) ──────────────────────────────────────────────────────────────────
const instr = await fetch(`${BASE}/v1/instructions`).then((r) => r.json()).catch(() => ({})) as any;
ok("GET /v1/instructions serves the preprompt", typeof instr.instructions === "string" && instr.instructions.length > 1000);
ok("…and points at both entrypoints (/mcp + /v1)", !!instr?.entrypoints?.mcp && !!instr?.entrypoints?.openapi);
const init = await rpc("initialize", {});
ok("POST /mcp initialize returns serverInfo + instructions", init.body?.result?.serverInfo?.name === "construction-intelligence" && typeof init.body?.result?.instructions === "string");

if (!KEY) {
  console.log("\n  (set CONIN_TEST_KEY to run tools/list, generate, and the /v1↔/mcp consistency check)\n");
  console.log(`${pass} passed, ${fail} failed (handshake only).`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── tools/list == the registry (key-scoped) ─────────────────────────────────────────────────────
const list = await rpc("tools/list");
const names: string[] = (list.body?.result?.tools ?? []).map((t: any) => t.name);
ok("tools/list returns the catalog over the key", names.length >= 10, `got ${names.length}`);
for (const need of ["list_deliverables", "generate_deliverable", "locate_project", "recommend_deliverables"]) {
  ok(`tools/list includes ${need}`, names.includes(need));
}
ok("tools/list does NOT leak the superadmin tools to a key", !names.includes("get_trace") && !names.includes("list_traces"));

// ── tools/call generate_deliverable → a graded result (C.1) ─────────────────────────────────────
const ipcInputs = { contractSum: 100_000_000, grossCumulative: 50_000_000, retentionPercent: 5 };
const call = await rpc("tools/call", { name: "generate_deliverable", arguments: { kind: "interim-payment-certificate", inputs: ipcInputs } });
const callText = call.body?.result?.content?.[0]?.text ?? "";
let mcpResult: any = null; try { mcpResult = JSON.parse(callText); } catch { /* not json */ }
ok("tools/call generate_deliverable returns a graded result", !!mcpResult && typeof mcpResult.posture === "string" && Array.isArray(mcpResult.tables), `posture=${mcpResult?.posture}`);

// ── C.4 consistency: the SAME deliverable via /v1 OpenAPI (the ChatGPT path) == via /mcp ─────────
const v1 = await fetch(`${BASE}/v1/deliverables`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": KEY },
  body: JSON.stringify({ kind: "interim-payment-certificate", inputs: ipcInputs }),
}).then((r) => r.json()).catch(() => null) as any;
// compare a stable projection (title + posture + the figures), not the whole object (it may carry per-call notes)
const proj = (d: any) => d && JSON.stringify({ kind: d.kind, title: d.title, posture: d.posture, figures: d.figures });
ok("C.4 — /v1 and /mcp yield the SAME deliverable (one core, two protocol-views)", !!mcpResult && !!v1 && proj(mcpResult) === proj(v1),
  mcpResult && v1 ? `mcp≠v1` : "one side missing");

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
