/**
 * contract.ts (conin-plugin) — the production Construction-Intelligence agent, migrated onto the Suluk `x-suluk-agents` standard
 * (C027). This is the production migration artifact (not the toy test fixture): conin's full 39-tool surface as an
 * OpenAPI v4 document + a two-tier agent declaration, faithful to conin's own architecture
 * (`constructionIntelligence/app/src/app.ts`):
 *
 *   • orchestrator `conin` — its model-bearing `operate` skill (deterministic-first: every NUMBER comes from a
 *     deterministic route; the LLM only routes + grades SOURCED/ASSUMED) + the deterministic ROUTES (run_core_primitive
 *     + the deliverable/study/library/project operations).
 *   • untrusted sub-agent `coninRetrieval` — the LLM-ranking tier (search_library / find_comparables / evidence_for /
 *     … ) that returns ASSUMED-grade candidates only, never a graded figure.
 *
 * TIERS mirror conin's RESIDENT_TOOLS (app.ts:2520) exactly: `tier:"resident"` = the 7 always-visible routes
 * (+ the synthetic `discover_tools` the server adds); everything else is `tier:"cold-tail"`, withheld from the default
 * `tools/list` and revealed on demand. Feeding `residentToolNames(coninContract,"conin")` to `@suluk/mcp`
 * `mcpApp({ resident })` reproduces conin's tier-trim on the served path — closing its public-/mcp over-serve.
 *
 * SCOPES mirror conin's TOOL_SCOPE (app.ts:2527): library:read|write, studies:read|write, priors:read. The
 * orchestrator GRANTS the union its sub-tree uses (incl. the retrieval child's library:read — a child's effective
 * scope is INTERSECTION(child, caller), so an absent grant would be silently dropped).
 */
import type { OpenAPIv4Document, Request, HttpMethod, SulukRouteRef } from "@suluk/core";

/** A compact request stub: each conin tool is one operation (a Request). The body/param schemas are elided here —
 *  this artifact captures the agent COMPOSITION (skills/routes/tiers/scopes), which is what the standard governs. */
const op = (method: HttpMethod, summary: string): Request => ({ method, summary, responses: { ok: { status: 200 } } });
/** A route ref: by-name operationRef + guarantee + tier + scope (the fields the standard reads). */
const r = (operationRef: string, scope: string[], tier: "resident" | "cold-tail", guarantee: SulukRouteRef["guarantee"] = "same-in-same-out"): SulukRouteRef =>
  ({ operationRef, guarantee, tier, scope });
const ref = (p: string, o: string) => `#/paths/${p.replace(/\//g, "~1")}/requests/${o}`;

export const coninContract: OpenAPIv4Document = {
  openapi: "4.0.0-candidate",
  info: { title: "Conin — Construction Intelligence", version: "1.0.0" },
  paths: {
    // ── deterministic orchestrator operations (run by `conin`) ───────────────────────────────────────────────
    "v1/library": { requests: { listLibrary: op("get", "List documents visible to the org") } },
    "v1/projects": { requests: { listProjects: op("get", "List projects"), createProject: op("post", "Create a long-lived project") } },
    "v1/projects/locate": { requests: { locateProject: op("get", "Infer a project's lifecycle position (graded)") } },
    "v1/deliverables": { requests: {
      listDeliverables: op("get", "List deliverable kinds + required inputs"),
      recommendDeliverables: op("get", "Route by project position + library coverage"),
      generateDeliverable: op("post", "Generate a provenance-graded deliverable (SOURCED/ASSUMED)"),
      describeDeliverableSchema: op("get", "Machine-readable input contract for one kind"),
      suggestDeliverableKind: op("get", "Rank deliverable kinds by intent (keyword/stage prefilter)"),
      prepareDeliverableInputs: op("post", "Draft a kind's inputs from a project's documents (key-match)"),
      validateDeliverableInputs: op("post", "Dry-run inputs (posture + ASSUMED figures + normalized names)"),
    } },
    "v1/primitives": { requests: { runCorePrimitive: op("post", "Run one deterministic spine primitive (audit_boq/reconcile/spread_scurve/classify_sections/infer_position)") } },
    "v1/studies": { requests: {
      listStudies: op("get", "List saved studies"),
      getStudy: op("get", "Re-fetch a saved study by key (headline | full)"),
      generateStudy: op("post", "Generate a feasibility study from a goal against the library"),
      listFixes: op("get", "What to fix FIRST to make a study decision-grade"),
      getTemplate: op("get", "Get a study's output template"),
      setTemplate: op("post", "Set/replace a study's output template"),
    } },
    "v1/studies/overrides": { requests: {
      listOverrides: op("get", "List a study's overrides (active + history)"),
      setOverride: op("post", "Override a model assumption (caps study at PROVISIONAL)"),
      unsetOverride: op("post", "Remove an active override (reversible)"),
    } },
    "v1/priors": { requests: { getPriors: op("get", "Learned market priors (scope-conditioned median/IQR/n)") } },
    "v1/document-requests": { requests: { listDocumentRequests: op("get", "The bounty ledger of most-wanted documents") } },
    "v1/documents": { requests: {
      getDocumentText: op("get", "Read a document's extracted raw text + artifacts"),
      getDocumentFacts: op("get", "Read a document's cached typed facts"),
      describeDocument: op("post", "Set/update a document's description"),
      ingestFromUrl: op("post", "Add a document to the library by URL"),
    } },
    // ── superadmin-only (trace/debug) ────────────────────────────────────────────────────────────────────────
    "v1/traces": { requests: { listTraces: op("get", "List recent run traces"), getTrace: op("get", "Fetch a full structured run trace") } },
    // ── retrieval tier operations (run by `coninRetrieval`; LLM-ranked, ASSUMED-grade) ───────────────────────
    "v1/library/search": { requests: { searchLibrary: op("get", "LLM-rank documents most relevant to a query") } },
    "v1/library/extract": { requests: { extractDocumentFacts: op("post", "LLM-extract a kind's input values from a document (+snippets)") } },
    "v1/library/triage": { requests: { triageDocument: op("post", "Re-run AI triage (description/category/confidence/importance)") } },
    "v1/comparables": { requests: { findComparables: op("get", "LLM-rank comparable documents + priors") } },
    "v1/evidence": { requests: { evidenceFor: op("get", "LLM-pick facts that back/contradict a claim") } },
    "v1/studies/search": { requests: { searchStudies: op("get", "LLM-rank saved studies by relevance") } },
    "v1/studies/scaffold": { requests: { predictScaffold: op("get", "LLM-predict likely goal + output template from the library") } },
  },

  "x-suluk-agents": {
    conin: {
      // matches conin's published plugin.json description (so projectClaudePlugin reproduces it verbatim).
      description: "Construction Intelligence: generate decision-grade construction deliverables (feasibility studies, cost plans, IPC/mostakhlas payment certificates, variation accounts, claims registers, tender evaluations, final accounts) from your documents. Deterministic-first — every figure is graded SOURCED or ASSUMED.",
      scope: ["library:read", "library:write", "studies:read", "studies:write", "priors:read"],
      maxDepth: 1,
      skills: {
        conin: {
          modelProfile: "tool-reliable",
          modelResolve: "pinned",
          tier: "cold-tail",
          // the skill's `whenToUse` becomes the SKILL.md `description` Claude reads to decide when to invoke — conin's
          // own trigger blurb (names the deliverables + the domain), verbatim from its build-skill.ts.
          whenToUse: "Operate Conin (Construction Intelligence) for MENA construction & real-estate projects: generate decision-grade deliverables — feasibility studies, residual land value, cost plans, IPC/mostakhlas payment certificates, retention & advance recovery, variation registers & quotations, dayworks, claims & loss-and-expense, tender evaluations, final accounts, FIDIC contract data, BOQ readiness/audit. Use whenever the user wants to model, cost, value, certify, reconcile, or audit a construction project. Deterministic-first: every figure is SOURCED or ASSUMED.",
          provenance: { source: "https://construction-intelligence.saastemly.com/v1/instructions", contentHash: "sha256-9f2c0000deadbeef", version: "2026-06-11" },
        },
      },
      routes: {
        // RESIDENT (mirror conin RESIDENT_TOOLS): always-visible orchestrator routes
        list_library:        r(ref("v1/library", "listLibrary"), ["library:read"], "resident", "idempotent"),
        locate_project:      r(ref("v1/projects/locate", "locateProject"), ["studies:read"], "resident"),
        list_deliverables:   r(ref("v1/deliverables", "listDeliverables"), ["studies:read"], "resident", "idempotent"),
        generate_deliverable:r(ref("v1/deliverables", "generateDeliverable"), ["studies:read"], "resident"),
        list_fixes:          r(ref("v1/studies", "listFixes"), ["studies:read"], "resident", "idempotent"),
        get_study:           r(ref("v1/studies", "getStudy"), ["studies:read"], "resident", "idempotent"),
        // COLD-TAIL: deterministic routes revealed on demand via discover_tools
        run_core_primitive:        r(ref("v1/primitives", "runCorePrimitive"), ["studies:read"], "cold-tail"),
        recommend_deliverables:    r(ref("v1/deliverables", "recommendDeliverables"), ["studies:read"], "cold-tail", "idempotent"),
        describe_deliverable_schema:r(ref("v1/deliverables", "describeDeliverableSchema"), ["studies:read"], "cold-tail", "idempotent"),
        suggest_deliverable_kind:  r(ref("v1/deliverables", "suggestDeliverableKind"), ["studies:read"], "cold-tail", "idempotent"),
        prepare_deliverable_inputs:r(ref("v1/deliverables", "prepareDeliverableInputs"), ["studies:read"], "cold-tail"),
        validate_deliverable_inputs:r(ref("v1/deliverables", "validateDeliverableInputs"), ["studies:read"], "cold-tail"),
        generate_study:            r(ref("v1/studies", "generateStudy"), ["studies:write"], "cold-tail", "idempotent"),
        list_studies:              r(ref("v1/studies", "listStudies"), ["studies:read"], "cold-tail", "idempotent"),
        get_template:              r(ref("v1/studies", "getTemplate"), ["studies:read"], "cold-tail", "idempotent"),
        set_template:              r(ref("v1/studies", "setTemplate"), ["studies:write"], "cold-tail"),
        list_overrides:            r(ref("v1/studies/overrides", "listOverrides"), ["studies:read"], "cold-tail", "idempotent"),
        set_override:              r(ref("v1/studies/overrides", "setOverride"), ["studies:write"], "cold-tail"),
        unset_override:            r(ref("v1/studies/overrides", "unsetOverride"), ["studies:write"], "cold-tail"),
        get_priors:                r(ref("v1/priors", "getPriors"), ["priors:read"], "cold-tail", "idempotent"),
        list_document_requests:    r(ref("v1/document-requests", "listDocumentRequests"), ["library:read"], "cold-tail", "idempotent"),
        list_projects:             r(ref("v1/projects", "listProjects"), ["studies:read"], "cold-tail", "idempotent"),
        create_project:            r(ref("v1/projects", "createProject"), ["studies:write"], "cold-tail"),
        get_document_text:         r(ref("v1/documents", "getDocumentText"), ["library:read"], "cold-tail", "idempotent"),
        get_document_facts:        r(ref("v1/documents", "getDocumentFacts"), ["library:read"], "cold-tail", "idempotent"),
        describe_document:         r(ref("v1/documents", "describeDocument"), ["library:write"], "cold-tail"),
        ingest_from_url:           r(ref("v1/documents", "ingestFromUrl"), ["library:write"], "cold-tail"),
        list_traces:               r(ref("v1/traces", "listTraces"), ["studies:read"], "cold-tail", "idempotent"),
        get_trace:                 r(ref("v1/traces", "getTrace"), ["studies:read"], "cold-tail", "idempotent"),
      },
      agents: { retrieval: { ref: "#/x-suluk-agents/coninRetrieval" } },
    },

    coninRetrieval: {
      description: "Untrusted retrieval tier: LLM-rank documents / facts / studies / comparables / evidence relevant to an intent. Returns ASSUMED-grade material ONLY — never emits a graded figure; the orchestrator applies it deterministically.",
      scope: ["library:read", "studies:read", "priors:read"],
      maxDepth: 0,
      trustBoundary: "untrusted",
      skills: {
        search: {
          modelProfile: "cheap-fast",
          modelResolve: "router",
          tier: "resident",
          whenToUse: "Find the right documents / facts / comparables / evidence for the orchestrator's intent. Rank, never invent; return ASSUMED-grade candidates only.",
          provenance: { source: "https://construction-intelligence.saastemly.com/v1/instructions#retrieval", contentHash: "sha256-1a7d0000feedface", version: "2026-06-11" },
        },
      },
      routes: {
        // RESIDENT: search_library is in conin's RESIDENT_TOOLS (the one always-visible retrieval tool)
        search_library:        r(ref("v1/library/search", "searchLibrary"), ["library:read"], "resident", "idempotent"),
        // COLD-TAIL retrieval routes
        extract_document_facts:r(ref("v1/library/extract", "extractDocumentFacts"), ["library:read"], "cold-tail", "idempotent"),
        triage_document:       r(ref("v1/library/triage", "triageDocument"), ["library:read"], "cold-tail", "idempotent"),
        find_comparables:      r(ref("v1/comparables", "findComparables"), ["library:read"], "cold-tail", "idempotent"),
        evidence_for:          r(ref("v1/evidence", "evidenceFor"), ["studies:read"], "cold-tail", "idempotent"),
        search_studies:        r(ref("v1/studies/search", "searchStudies"), ["studies:read"], "cold-tail", "idempotent"),
        predict_scaffold:      r(ref("v1/studies/scaffold", "predictScaffold"), ["studies:read"], "cold-tail", "idempotent"),
      },
      agents: {},
    },
  },
};

/** The pinned instruction snapshots a projector is fed (never fetched at generate time). */
export const coninInstructions: Record<string, string> = {
  conin:
    "You are Conin. Deterministic-first: every NUMBER you state comes from a deterministic route (run_core_primitive, " +
    "generate_deliverable, the list_/get_ readers) — the LLM only routes and grades. Place the project (locate_project), " +
    "choose a deliverable, gather inputs, and grade every figure SOURCED or ASSUMED. To FIND documents/evidence, delegate " +
    "to the retrieval tier — never invent a figure from it.",
  search:
    "Retrieval tier. Rank the documents / facts / comparables / studies most relevant to the orchestrator's intent. You " +
    "return ASSUMED-grade candidates only — never a graded figure, never a final deliverable.",
};
