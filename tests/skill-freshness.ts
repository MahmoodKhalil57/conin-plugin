#!/usr/bin/env bun
// verifyAgentFreshness — the published SKILL.md is a contentHash-pinned SNAPSHOT of the app's served preprompt
// (`GET /v1/instructions`). If the live preprompt changes and the plugin isn't re-projected, the snapshot goes STALE
// and users get a skill that no longer matches the service. This gate fails when that drift happens, so a release can't
// silently ship a stale skill. PUBLIC endpoint ⇒ NO key needed (unlike the other two harnesses) ⇒ safe to run in CI.
//
//   bun tests/skill-freshness.ts                              # against production
//   CONIN_BASE=http://localhost:8787 bun tests/skill-freshness.ts
//
// To FIX a reported drift: `bun run build` (re-projects SKILL.md from the live preprompt) then commit.

import { verifySkillFreshness } from "@suluk/agents";

const BASE = (process.env.CONIN_BASE ?? "https://construction-intelligence.saastemly.com").replace(/\/$/, "");
const SKILL = new URL("../plugins/conin/skills/conin/SKILL.md", import.meta.url).pathname;

// the contentHash the SKILL.md was minted against (stamped in its GENERATED header by @suluk/agents)
const md = await Bun.file(SKILL).text();
const declared = md.match(/contentHash:\s*(sha256-[0-9a-f]+)/)?.[1];

const res = await fetch(`${BASE}/v1/instructions`);
if (!res.ok) { console.error(`✗ GET ${BASE}/v1/instructions → ${res.status}`); process.exit(1); }
const live = ((await res.json()) as { instructions?: string }).instructions ?? "";
if (live.length < 500) { console.error("✗ live instructions missing or implausibly short"); process.exit(1); }

const findings = verifySkillFreshness(declared, live);
const errors = findings.filter((f) => f.severity === "error");
for (const f of findings) console.log(`  ${f.severity === "error" ? "✗" : "⚠"} ${f.code}: ${f.detail}`);

if (errors.length) { console.log(`\n✗ skill is STALE vs ${BASE}/v1/instructions — run \`bun run build\` and commit.`); process.exit(1); }
console.log(`\n✓ SKILL.md (${declared}) is in sync with the live preprompt @ ${BASE}.`);
