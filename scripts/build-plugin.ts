#!/usr/bin/env bun
// Generate the WHOLE conin plugin bundle (plugin.json + .mcp.json + skills/conin/SKILL.md) as a PROJECTION of conin's
// x-suluk-agents contract (../contract.ts) via @suluk/agents. The SKILL.md body is the LIVE `GET /v1/instructions`,
// pinned + contentHashed — so the plugin can never drift from either the app's preprompt OR the agent's tool/tier
// composition. Replaces the bespoke build-skill.ts (which only regenerated the SKILL.md).
//
//   bun run build                                  # against production
//   CONIN_BASE=http://localhost:8787 bun run build # against a local app
import { projectClaudePlugin } from "@suluk/agents";
import { coninContract } from "../contract";

const BASE = (process.env.CONIN_BASE ?? "https://construction-intelligence.saastemly.com").replace(/\/$/, "");

const res = await fetch(`${BASE}/v1/instructions`);
if (!res.ok) { console.error(`✗ GET ${BASE}/v1/instructions → ${res.status}`); process.exit(1); }
const doc = (await res.json()) as { instructions: string };
if (!doc.instructions || doc.instructions.length < 500) { console.error("✗ instructions missing or implausibly short"); process.exit(1); }

const bundle = projectClaudePlugin(coninContract, "conin", {
  mcpUrl: `${BASE}/mcp`,
  version: "1.0.0",
  displayName: "Conin — Construction Intelligence",
  homepage: BASE,
  keywords: ["construction", "feasibility", "quantity-surveying", "FIDIC", "MENA", "deliverables", "reconciliation"],
  author: { name: "Conin", email: "saastemly@gmail.com" },
  instructions: { conin: doc.instructions }, // the live preprompt → skills/conin/SKILL.md, contentHashed
});

// map the projected paths into the marketplace plugin layout (plugin.json lives under .claude-plugin/)
const root = new URL("../plugins/conin/", import.meta.url).pathname;
const LAYOUT: Record<string, string> = {
  "plugin.json": ".claude-plugin/plugin.json",
  ".mcp.json": ".mcp.json",
  "skills/conin/SKILL.md": "skills/conin/SKILL.md",
};
for (const [gen, content] of Object.entries(bundle.files)) {
  await Bun.write(root + (LAYOUT[gen] ?? gen), content);
  console.log("✓", LAYOUT[gen] ?? gen);
}
console.log(`\nplugin projected from contract.ts (39 tools, ${Object.keys(bundle.files).length} files) + the live preprompt.`);
