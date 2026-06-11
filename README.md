# Conin — Construction Intelligence (Claude plugin)

Turn raw, messy construction documents into rigorous, **decision-grade deliverables** — feasibility studies, cost
plans, IPC/mostakhlas payment certificates, variation accounts & quotations, dayworks, claims & loss-and-expense
registers, tender evaluations, retention & advance recovery, final accounts, FIDIC contract data, BOQ readiness/audit —
across the whole project lifecycle (idea → turn-key), for MENA construction & real-estate.

This repo is a **Claude Code plugin marketplace**. The plugin is a thin host over Conin's hosted core: one remote MCP
server + a generated skill. Conin is **deterministic-first** — every figure it states is graded **SOURCED** (traced to
one of your documents) or **ASSUMED** (a prior/default); any assumed figure caps a deliverable at **PROVISIONAL**.

## Install

In Claude Code:

```
/plugin marketplace add MahmoodKhalil57/conin-plugin
/plugin install conin@conin-marketplace
```

On first tool use you'll be prompted to **log in** (browser OAuth) to your Conin account — compute is metered against
your organization's prepaid balance. Then just ask:

> *Draft an interim payment certificate: contract sum EGP 100,000,000, work done to date 50,000,000, retention 5%.*

## What's in here

```
.claude-plugin/marketplace.json          the marketplace manifest (lists the conin plugin)
plugins/conin/
  ├── .claude-plugin/plugin.json         the plugin manifest
  ├── .mcp.json                          the REMOTE MCP server (https://…/mcp, OAuth on first use)
  └── skills/conin/SKILL.md              the skill — GENERATED from the app, never hand-edited
scripts/build-skill.ts                   regenerates SKILL.md from GET /v1/instructions (single source of truth)
tests/                                   the unattended test harness (see below)
```

The skill carries no duplicated knowledge: it's the app's own served preprompt (`GET /v1/instructions`) wrapped in a
short trigger. **`SKILL.md` is generated — do not edit it by hand.** To refresh it after an app release:

```sh
bun scripts/build-skill.ts                                   # against production
CONIN_BASE=http://localhost:8787 bun scripts/build-skill.ts  # against a local app
```

## Tests

Both harnesses run against the live core; both are unattended once a scoped **test API key** is set (mint one in the
web app; `studies:read` is enough). They mirror the app repo's pragmaticgui pattern.

```sh
# C.1 + C.4 — server-level: the key authenticates /mcp; /mcp and /v1 yield the SAME deliverable (one core, two views)
CONIN_TEST_KEY=ci_… bun tests/server-level.ts

# C.2 + C.3 — plugin-level: drive a real `claude` CLI (via pragmaticgui) and assert it CALLS a Conin tool for a figure
#   first register the MCP for the test cwd over the key path (no interactive OAuth):
claude mcp add --scope local --transport http --header "x-api-key: $CONIN_TEST_KEY" \
  conin https://construction-intelligence.saastemly.com/mcp
CONIN_TEST_KEY=ci_… bun tests/plugin-pragmatic.ts
```

Without a key, `server-level.ts` still runs the public handshake checks (`/v1/instructions`, MCP `initialize`).

## Other hosts

Conin is a host-agnostic core; the same `GET /v1/instructions` + `/v1` OpenAPI + `/mcp` power other front-ends:

- **ChatGPT** — a custom GPT: Instructions = `GET /v1/instructions`, Actions = the `/v1` OpenAPI, Auth = a Conin API key.
- **Any OpenAI/OpenAPI-compatible agent** — point it at `/v1` (REST) or `/mcp` (MCP) with a scoped key.
