#!/usr/bin/env bun
// Workstream C.2 + C.3 — PLUGIN-LEVEL proof: drive a real `claude` CLI (via pragmaticgui, under a PTY) with the Conin
// MCP registered, and assert the agent (a) calls a Conin tool for a construction figure and (b) does NOT invent a number
// (deterministic-first). This is the behavioural layer the in-process tests can't see.
//
// ── SETUP ───────────────────────────────────────────────────────────────────────────────────────
//   Register the Conin MCP for the throwaway test cwd, using the KEY path (no interactive OAuth):
//     claude mcp add --scope local --transport http \
//       --header "x-api-key: $CONIN_TEST_KEY" conin https://construction-intelligence.saastemly.com/mcp
//   (Or install the plugin: /plugin marketplace add <owner>/conin-plugin && /plugin install conin — OAuth on first use.)
//   Then:  CONIN_TEST_KEY=ci_… bun tests/plugin-pragmatic.ts
//
// Each probe spawns a fresh agent, captures its stream-json `result` + tool calls, and checks the assertions.

import { mkdirSync } from "node:fs";

const PRAGMATIC = process.env.PRAGMATIC ?? `${process.env.HOME}/apps/pragmaticgui/src/pragmatic.ts`;
const MODEL = process.env.MCP_TEST_MODEL ?? "sonnet";
const CWD = "/tmp/conin-plugin-pragmatic";
mkdirSync(CWD, { recursive: true });

type Probe = { name: string; prompt: string; expectReply: RegExp[]; mustCallTool: boolean };
const PROBES: Probe[] = [
  {
    // C.2 — the skill trigger + a real task → a Conin tool call surfaces the deliverable
    name: "draft an interim payment certificate (tool call + right number)",
    prompt:
      "Use Conin. Draft an interim payment certificate: contract sum EGP 100,000,000; work done to date 50,000,000; retention 5%. " +
      "What is the retention deducted and the net amount this certificate?",
    expectReply: [/2[.,]?500[.,]?000|2\.5\s?m|2,500,000/i, /47[.,]?500[.,]?000|47\.5\s?m/i],
    mustCallTool: true,
  },
  {
    // C.3 — deterministic-first: a figure that maps to a tool must come FROM a tool, not be invented
    name: "deterministic-first — values a variation via the tool, not a guess",
    prompt:
      "Use Conin. Value this variation quotation: 120 m³ of concrete at EGP 2,500/m³ priced off the bill, plus 15% OH&P. " +
      "Give the total.",
    expectReply: [/345[.,]?000/i], // 120*2500=300,000 ; +15% = 345,000 — only correct if the tool computed it
    mustCallTool: true,
  },
];

async function runProbe(prompt: string): Promise<{ reply: string; toolCalls: string[] }> {
  const proc = Bun.spawn(
    ["bun", PRAGMATIC, "--tool", "claude", "--model", MODEL, "--print", "--output-format", "stream-json",
      "--dangerously-skip-permissions", "--trust", "auto", "--cwd", CWD, "-p", "-"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  proc.stdin.write(prompt); await proc.stdin.end();
  const kill = setTimeout(() => proc.kill(), 180_000);
  try {
    const out = await new Response(proc.stdout).text();
    let reply = ""; const toolCalls: string[] = [];
    for (const line of out.split("\n")) {
      const s = line.trim(); if (!s) continue;
      try {
        const o = JSON.parse(s);
        if (o.type === "result" && typeof o.result === "string") reply = o.result;
        // assistant tool_use blocks reveal WHICH tool was called (the deterministic-first evidence)
        if (o.type === "assistant" && Array.isArray(o.message?.content))
          for (const b of o.message.content) if (b?.type === "tool_use" && typeof b.name === "string") toolCalls.push(b.name);
      } catch { /* not JSON */ }
    }
    return { reply, toolCalls };
  } finally { clearTimeout(kill); }
}

let pass = 0;
for (const probe of PROBES) {
  process.stdout.write(`\n▶ ${probe.name}\n`);
  const { reply, toolCalls } = await runProbe(probe.prompt);
  const calledConin = toolCalls.some((t) => /conin|construction|deliverable|payment|variation|generate/i.test(t));
  const missReply = probe.expectReply.filter((re) => !re.test(reply));
  const toolOk = !probe.mustCallTool || calledConin;
  if (missReply.length === 0 && toolOk) { pass++; console.log(`  ✓ pass (tools: ${toolCalls.join(", ") || "none"})`); }
  else console.log(`  ✗ FAIL — ${!toolOk ? "no Conin tool call; " : ""}missing: ${missReply.map(String).join(", ")}\n    tools: ${toolCalls.join(", ") || "none"}\n    reply: ${reply.slice(0, 400)}`);
}
console.log(`\n${pass}/${PROBES.length} behavioural probes passed.`);
process.exit(pass === PROBES.length ? 0 : 1);
