---
name: icedq-author-rules
description: Creates iceDQ rules via the MCP server — the single creation path all iceDQ skills funnel through. Direct mode (user-facing): use when the customer already KNOWS the checks they want — they name COLUMNS or CHECK TYPES, not just a table and a goal — e.g. "check my customer table for nulls and duplicates", "create a validation rule on ORDERS with NotNull on order_id", "add a completeness check to the invoices table", "make order_id unique". Resolves the environment, confirms a short plan, creates the rules, offers execution. Build mode (invoked by other iceDQ skills, not by user phrasing): consumes a confirmed rule spec (references/rule-spec.md) from icedq-suggest-checks, icedq-compare-datasets, icedq-mapping-doc-rules, or icedq-etl-code-rules and creates WITHOUT re-asking approved decisions. NOT for: recommendations or coverage ("what should I be checking" → icedq-suggest-checks), migration/reconciliation planning (icedq-compare-datasets), running or scheduling existing rules.
server_compat: ">=2.0.0"
---

# iceDQ — Author Rules (Direct + Build)

You create **new iceDQ data quality rules** in the customer's **own** iceDQ environment. This skill
is the **only** place rules get created — other skills decide *what* rules are needed and hand you
a **rule spec**; you own *how* to build them correctly.

**Mode detection.** If you have been handed one or more rule specs (the format in
`references/rule-spec.md`) by another skill or an earlier planning step → **Build mode**. If a
person is telling you the specific checks they want → **Direct mode**. If they are instead asking
what they *should* check, want recommendations, or want to explore — that is the advisor's job:
hand off to `icedq-suggest-checks`. Direct mode ends by producing specs and running them through
the Build steps — one creation path, whichever door the work came in through.

Read `references/conventions.md` (ID resolution, get_guidance-first, async, communication),
`references/rule-taxonomy.md` (rule-type decisions and naming), `references/rule-spec.md` (the
contract), and `references/cross-platform-recon.md` before any two-dataset comparison.

## Golden rules (both modes)

1. **`get_guidance` is always step 1** before touching a creation tool (`create_validation_rules`,
   `create_recon_rules`, `create_pushdown_rules`, `create_duplicate_rules`,
   `create_checksum_rules`). It ships inside the customer's server and is authoritative over these
   references.
2. **Never hardcode IDs.** Every workspaceId, connectionId, folderId, ruleId is a UUID unique to
   this tenant — resolve each from the matching `list_*` tool at run time.
3. **Plan before create.** Never call a creation tool until the customer has seen and approved a
   plan of what will be built. In Build mode the approved plan *is* the spec.
4. **Never ask the same question twice.** A populated spec field is an approved decision
   (`rule-spec.md` invariant). Ask only about blanks and `openQuestions`.
5. **Right rule type, once.** In Direct mode, translate the customer's asks with
   `references/rule-taxonomy.md`. In Build mode, the producer already chose — **validate, don't
   re-choose**; if a spec is mis-typed, flag it back with reasoning.
6. **Execute only with consent.** Creating and running are separate decisions. Always offer; never
   assume.

## Direct mode — building the checks a customer names

### Step 1 — Capture and translate
Take their list of checks as stated. Translate each into the correct rule type with
`references/rule-taxonomy.md`; ask one clarifying question where an item is ambiguous rather than
guessing. Combine all row-level checks for one table into ONE Validation rule. If at any point they
ask "what else should I check?" or want recommendations — hand off to `icedq-suggest-checks`.

### Step 2 — Resolve the environment
`list_workspaces` → workspace; `list_connections` → **ACTIVE** connection(s) (Recon/Checksum need
two). Detect file connections early (`flat-file`, `parquet`, `excel`, `json`, `xml`,
`flat-file-sql`) — files follow the `fetch_file_sample_data`-first flow in `get_guidance`, never a
direct create call. Confirm the exact table via `list_connection_metadata`
(`database → schema → table`; skip `database` when `get_database_metadata` shows no database
hierarchy) — the same table name can exist in multiple schemas; never assume. Offer a
`fetch_db_sample_data` preview if the customer wants to confirm the data. `list_folders` → folder
(propose + `create_folder` only after approval).

### Step 3 — Check for existing rules (reuse before create)
`list_rules(workspaceId, nameFilter=<table name>)` → for plausible matches, `get_rule` to confirm
what they actually check. Advise per requested check: **reuse as-is / extend (`update_rule`) /
create new** — never propose a check the customer already has. Carry these decisions into Step 4's
plan.

### Step 4 — Confirm the plan
Present a short plan: each rule's proposed name (naming convention from the taxonomy; they decide),
type and why, checks, and folder. **Wait for confirmation**; apply edits.

### Step 5 — Create via the Build path
Run each approved item as an internal rule spec through the Build mode steps below — one creation
path to maintain and test.

### Step 6 — Explain, then offer execution
Per rule: name, what it checks, where it lives, published and ready to run (MCP-created rules
auto-publish — never tell them to publish from the UI). Then ask: "Want me to run these now?"
If yes: `execute_rules_or_workflows` → poll `get_workflow_run_status_or_result` (2–3s) to a
terminal state → summarize in business terms → exception detail on request
(`get_checks_exception_report` in chat or `get_exception_report_url` for the UI — ask which).
Deep failure analysis hands off to the run-and-report flow.

## Build mode — creating from a rule spec

### Step 1 — Validate the spec
- `ruleType` against `references/rule-taxonomy.md`. If it's wrong for the job the spec describes,
  **stop and flag back** to the producer/customer with your reasoning — never silently re-choose.
- Required fields present for that type (see `rule-spec.md`); all IDs are resolved UUIDs.
- Two-dataset specs (Recon/Checksum): confirm the comparison settings are deliberate —
  cross-platform specs should set `sortMode` explicitly (`cross-platform-recon.md` §1). If the
  producer left it unset for a cross-platform pair, raise it *before* creating: **`sortMode` is
  create-time-only** and cannot be patched later.

### Step 2 — Resolve blanks only
Populated = approved (never re-ask). For blanks and `openQuestions`, ask the customer now — these
are the only questions Build mode is allowed to ask.

### Step 3 — Guidance, then create
`get_guidance` for the rule type → follow it over the spec's field naming → call the matching
`create_*` tool (file datasets: `fetch_file_sample_data` first, per guidance; if the spec carries
`existingDraftRuleId` from the producer's file registration, complete that draft via `update_rule`
instead of creating anew). One tool call per spec; rules auto-publish.

### Step 4 — Confirm back in the spec's terms
Report `ruleId`, name, state, and what it checks — to the customer in Direct mode, or back to the
invoking flow (which owns run/report next steps) otherwise. If creation fails, report the error
against the spec field that caused it; don't improvise a different rule shape.

## Communication
Lead with the business meaning ("this rule catches customer rows with no email address"), then the
mechanics for those who want them. Plans and results are read by data owners, not just engineers —
see `references/conventions.md` §5.
