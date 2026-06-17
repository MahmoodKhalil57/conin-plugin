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
scripts/build-plugin.ts                   projects the WHOLE plugin (plugin.json + .mcp.json + SKILL.md) from contract.ts + the live preprompt
tests/                                   the unattended test harness (see below)
```

The skill carries no duplicated knowledge: it's the app's own served preprompt (`GET /v1/instructions`) wrapped in a
short trigger. **`SKILL.md` is generated — do not edit it by hand.** To refresh it after an app release:

```sh
bun scripts/build-plugin.ts                                   # against production
CONIN_BASE=http://localhost:8787 bun scripts/build-plugin.ts  # against a local app
```

## Tests

The key-gated harnesses run against the live core, unattended once a scoped **test API key** is set (mint one in the
web app; `studies:read` is enough). They mirror the app repo's pragmaticgui pattern. The freshness gate needs no key.

```sh
# freshness — fail if SKILL.md drifted from the live served preprompt (public endpoint, NO key; also runs in CI)
bun run freshness

# C.1 + C.4 — server-level: the key authenticates /mcp; /mcp and /v1 yield the SAME deliverable (one core, two views)
CONIN_TEST_KEY=ci_… bun tests/server-level.ts

# C.2 + C.3 — plugin-level: drive a real `claude` CLI (via pragmaticgui) and assert it CALLS a Conin tool for a figure
#   first register the MCP for the test cwd over the key path (no interactive OAuth).
#   NB: name + url come BEFORE --header — the variadic --header would otherwise swallow them as extra header values.
claude mcp add conin https://construction-intelligence.saastemly.com/mcp \
  --scope local --transport http --header "x-api-key: $CONIN_TEST_KEY"
CONIN_TEST_KEY=ci_… bun tests/plugin-pragmatic.ts
```

Without a key, `server-level.ts` still runs the public handshake checks (`/v1/instructions`, MCP `initialize`).
CI (`.github/workflows/freshness.yml`) runs `bun run freshness` on every push/PR + daily, so the published skill can't
silently go stale when the app repo ships a new preprompt.

## Other hosts

Conin is a host-agnostic core: one preprompt (`GET /v1/instructions`) + one tool surface, projected into each host's
shape. Besides this Claude plugin, the app **serves two more host projections** — both public, always-fresh, and
identical-by-construction to `/mcp` (same `toSulukDoc`/`toolsFrom` pipeline):

| Host | Tool surface | Instructions |
| --- | --- | --- |
| Claude (this plugin) | remote `/mcp` (OAuth) | `skills/conin/SKILL.md` (pinned snapshot) |
| ChatGPT custom GPT | `GET /v1/openapi.chatgpt.json` (Actions) | paste `GET /v1/instructions?format=text` |
| OpenRouter / any OpenAI-tool agent | `GET /v1/openrouter.json` (function-tools) | fetch `manifest.instructions.source` |

### ChatGPT custom GPT

1. **Create a GPT** → chatgpt.com → *Create*.
2. **Instructions** — paste the body of `GET https://construction-intelligence.saastemly.com/v1/instructions?format=text`.
3. **Actions → Import from URL** — `https://construction-intelligence.saastemly.com/v1/openapi.chatgpt.json`. This is a
   curated **26-operation, valid OpenAPI 3.0.3** schema: ChatGPT enforces a ~30-action cap and a partial 3.0 parser, so it
   drops the binary xlsx export + advanced template-scaffold tuning, downconverts 3.1 constructs, and excludes every
   web-only route. (Everything is still reachable via `/mcp`, the full `/v1`, or the web app.)
4. **Authentication → API Key → Custom header**, header name `x-api-key`, value = a scoped Conin key (`ci_…`, mint one in
   the web app).
5. A **Privacy Policy URL** is required only to **publish/share** the GPT (public or GPT Store); a private "only me" GPT
   needs none. Publishing to the Store also needs a verified builder profile (business name or DNS-TXT domain verification).

### OpenRouter (or any OpenAI-compatible tool-calling agent)

OpenRouter has no hosted-agent/manifest concept — `GET /v1/openrouter.json` is a **developer-side config** you load into
your own loop: it carries OpenAI function-tools (the full public surface), an instructions **pointer** (URL + contentHash
+ version, never inlined), and a cheap→capable model list. The loop:

1. `GET manifest.instructions.source` (= `/v1/instructions`) → use as the **system message** (optionally check the sha256).
2. POST `https://openrouter.ai/api/v1/chat/completions` with `model = manifest.model[0]`, your system message, and
   `tools = manifest.tools` verbatim (`Authorization: Bearer <OPENROUTER_KEY>`).
3. On `finish_reason: "tool_calls"`, `JSON.parse` each call's `arguments` and dispatch by `function.name` to the matching
   Conin `/v1` route **or** `/mcp` `tools/call`, sending your scoped `x-api-key`.
4. Append `{role:"tool", tool_call_id, content}` for each and re-POST; loop until `finish_reason: "stop"`.

Because the tool JSON shape is identical across OpenRouter, Conin `/v1`, and Conin `/mcp`, no per-host schema translation
is needed — only name→route dispatch + auth.
