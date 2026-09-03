# Skill ↔ server compatibility & architecture

## Versioning

**Single source of truth.** The iceDQ version lives in `package.json` (`version`). `manifest.json`,
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and every skill's `server_compat`
frontmatter are aligned to it (the build derives its version from `package.json`; dev keeps a
`-SNAPSHOT` suffix, release artifacts drop it).

**Why skills are versioned with the server.** iceDQ ships as a self-hosted server customers run in their
own datacenter, so different customers run different versions. Skills reference tool names, parameters,
and `get_guidance` topics that change between versions, so a skill bundle is only guaranteed to match the
server release it shipped with. Skills are bundled with each server release and versioned in lockstep.

**`server_compat`.** Each `SKILL.md` declares `server_compat` (currently `>=2.0.0`) — the minimum iceDQ
server version the skill is written for. Traceability + a floor, not a hard runtime gate.

**Drift handling.** Skills defer to the server's own bundled `get_guidance` for version-specific detail,
so minor drift is absorbed server-side. If a required tool is missing or a guidance topic is unknown at
runtime, the skill tells the customer their skills may not match their server version rather than
improvising (see `_shared/conventions.md` § 6).

## Architecture — the layer model

The skill set is organized in layers with **one creation path** and **one contract** between layers.

| Layer | Skills | Owns |
|---|---|---|
| **Intent (playbooks)** | `icedq-suggest-checks`, `icedq-compare-datasets` | *What* to check and why. `suggest-checks` is the guided front door for data testing: requirements intake, environment search, **coverage analysis**, recommendations, a reviewed Data Testing Plan, and follow-up handoffs (execute/schedule/workflow). `compare-datasets` owns the comparison jobs: migration certification and ongoing reconciliation. Both pre-assign rule types and emit specs. |
| **Spec generators** | `icedq-mapping-doc-rules`, `icedq-etl-code-rules`, `icedq-api-testing` | Deriving checks from an artifact or connection type (mapping document / ETL code / REST API response, self-validated or reconciled against a backend). Analysis stays here; creation does not. |
| **Mechanic (creation)** | `icedq-author-rules` | *How* to create rules correctly on this server version. **Direct mode** = user-facing, for customers who already know the exact checks they want (resolve → short plan → confirm → create → explain → offer execution). **Build mode** = consumes rule specs from any producer and creates without re-asking. Recommendation/exploration requests are routed to `icedq-suggest-checks`. |
| **Operational** | `icedq-run-and-report`, `icedq-schedule-and-monitor` | Executing/interpreting existing rules; recurring automation and run history. |
| **Reference / Q&A** | `icedq-docs` (separate bundle) | How iceDQ works. |

**The rule-spec contract** (`_shared/rule-spec.md`) is the interface between producers (intent skills,
spec generators, Discovery mode) and Build mode. Its invariant: **a populated spec field is an approved
customer decision — Build mode never re-asks; it validates (including rule-type sanity against
`rule-taxonomy.md`) and flags mis-typed specs back to the producer rather than silently re-choosing.**
Producers decide rule types; Build mode owns creation mechanics and version-correct `get_guidance`
usage. Create-time-only settings (e.g. Recon `sortMode`) must be decided by the producer in the spec.
The contract carries `specVersion` (currently `1`); bump it in lockstep with the bundle when fields
change.

**No skill other than `icedq-author-rules` calls a `create_*` rule tool or `update_rule` for creation.**
The exceptions are `fetch_file_sample_data` (file producers) and `fetch_api_sample_data`
(`icedq-api-testing`) during analysis, which register a file/API schema and create a draft rule as
a side effect — the draft's ID travels in the spec as `existingDraftRuleId` for Build mode to
complete.

## Shared references (`_shared/`)

`conventions.md`, `rule-taxonomy.md`, `rule-spec.md`, `cross-platform-recon.md`, and
`groovy-recipes.md` are edited **only** in `_shared/` and copied into each consuming skill's
`references/` by `_shared/sync.sh` (skills ship self-contained). CI must run `_shared/sync.sh
--check` and `_shared/validate.sh` and fail on drift or structural violations.

**Release packaging:** `_shared/package.sh` runs validation then produces one upload-ready ZIP per
skill in `dist/skill-zips/` (skill folder at ZIP root, per the claude.ai upload format). Behavioral
evals live in `../evals/` — run them before cutting a release.

## Trigger boundaries (description design)

Skill routing is by description matching, so descriptions are written as a *set* with disjoint trigger
phrases and explicit "do NOT use … (use X)" cross-pointers. The load-bearing boundaries:

- **Knows-vs-asks:** a customer who *names the checks they want* → `icedq-author-rules` (Direct
  mode); a customer who *asks what to check*, wants guidance, exploration, or a coverage review →
  `icedq-suggest-checks`.
- Comparison *planning* (migration or reconciliation framing) → `icedq-compare-datasets`, even when
  the request starts as general advice — the advisor routes on framing mid-conversation.
- A *new* recurring reconciliation designed from scratch → `icedq-compare-datasets` (which hands the
  schedule back); automating rules that already *exist* → `icedq-schedule-and-monitor`.
- Artifact-driven derivation (doc/code) → the matching spec generator, even when invoked from within a
  compare-datasets plan.
- A named REST API/endpoint → `icedq-api-testing`, whether the ask is self-validation or
  reconciliation against a backend — even reconciliation framing routes here instead of
  `icedq-compare-datasets` once an API is explicitly named. BI report/dashboard testing has no
  dedicated skill yet (parked pending MCP tooling); it currently falls to the closest generic
  producer.

When adding or editing a skill, re-check the set: no quoted trigger phrase may appear in two
descriptions, and every plausible customer prompt should route to exactly one skill.

## Design history

`icedq-author-rules` originally carried a conversational Discovery mode. It graduated into the
standalone advisor `icedq-suggest-checks` when coverage analysis and guided data-testing demand
outgrew single-rule authoring. The rule-spec contract was the seam: the split changed only
author-rules (Discovery → Direct mode) and added the advisor — no other skill changed.
