---
name: icedq-compare-datasets
description: Intent playbook for comparing two datasets in iceDQ — one-time data-migration testing AND ongoing reconciliation; asks which when unclear. Migration framing: "I am moving data from SQL Server to Snowflake", "validate my data migration", "test the cutover before go-live". Reconciliation framing: "reconcile source vs target", "nightly reconciliation between billing and the GL", "compare my staging and warehouse tables", "these two systems should always match". A NEW recurring comparison, including its cadence, belongs here (the schedule is handed to icedq-schedule-and-monitor). Owns requirements intake, the mode gate, existing-rule reuse, the check plan with pre-assigned rule types, and cross-platform pitfalls — then emits rule specs to icedq-author-rules Build mode for creation. NOT for: ad-hoc single-dataset checks (icedq-author-rules), guidance on what to test (icedq-suggest-checks), mapping docs or ETL code (those skills), running/scheduling existing rules.
server_compat: ">=2.0.0"
---

# iceDQ — Compare Datasets (migration testing + reconciliation)

You help a customer **compare two datasets** in **their own** iceDQ environment. Two jobs live
here, separated by one question:

- **Migration mode — certify a copy.** The target is a copy of the source after a move. Finite
  work ending in go/no-go. Playbook: `references/migration-check-plan.md`.
- **Reconciliation mode — monitor an agreement.** Two related-but-different systems must keep
  agreeing on totals, keys, or integrity. Recurring work ending in a schedule. Playbook:
  `references/reconciliation-patterns.md`.

This skill owns **what** to check, in what order, and with which rule type. It does **not** create
rules itself: after the customer confirms the plan, it emits **rule specs**
(`references/rule-spec.md`) and hands them to **`icedq-author-rules` Build mode** — the single
creation path for all iceDQ skills.

Read `references/conventions.md` (IDs, get_guidance-first, async, communication),
`references/intake-checklist.md` (requirements gathering + the mode gate),
`references/rule-taxonomy.md` (rule-type decisions), and `references/cross-platform-recon.md`
before building any cross-engine comparison.

## Golden rules

1. **Intake before anything.** Run `references/intake-checklist.md` — including the mode gate —
   before resolving IDs or proposing checks. A one-line prompt ("I'm moving data from SQL Server
   to Snowflake") is not enough to build from.
2. **Reuse before you create.** Search for existing rules covering this comparison; summarize
   matches and advise reuse / update / create-new per rule. Default to not duplicating.
3. **This skill decides the rule type; Build mode validates it.** Pre-assign types from the
   playbook + `rule-taxonomy.md` in the plan. Never punt the type decision downstream.
4. **The customer approves the plan once; nobody re-asks.** Confirmed decisions travel inside the
   rule specs (populated field = approved — the `rule-spec.md` invariant).
5. **Approval-gated environment choices.** Connections, tables, folder, names: present options and
   wait. The same table name can exist in multiple schemas or databases — never assume the pair.
6. **Cheapest gate first; verify the compare.** Structure and counts before row-by-row. A recon
   reporting everything different on *both* sides is a comparison artifact
   (`cross-platform-recon.md`), not a finding — fix the compare, then re-run.
7. **`get_guidance` first** for anything you do call directly (metadata discovery, execution,
   exception analysis); creation guidance is Build mode's job.

## Workflow

### Step 1 — Intake (with the mode gate)
Run `references/intake-checklist.md` in small batches, skipping what the customer already said:
mode (certify vs monitor — skip if the prompt makes it obvious), seed artifacts (mapping doc →
`icedq-mapping-doc-rules`, ETL code → `icedq-etl-code-rules` as spec generators), source and
target definition (DB: engine/database/schema/table; file: type/location/name), connections
(named or search-and-present), workspace, folder, whether to search existing rules, and the
definition of correct. Reconcile mode additionally: common grain, tolerances, run cadence. Echo a
summary; confirm before resolving anything.

### Step 2 — Resolve the environment
- `list_workspaces` → confirm `workspaceId`; `list_connections` → **ACTIVE** only, resolve or
  search-and-present both sides; file connections follow the file flow per `get_guidance`.
- Resolve exact objects via `list_connection_metadata` / `fetch_db_sample_data`
  (`INFORMATION_SCHEMA` custom SQL) / `list_files`. Confirm the pair with the customer.

### Step 3 — Check for existing rules (reuse before create)
If opted in: `list_rules(workspaceId, nameFilter=…)` → `get_rule` per candidate → summarize (what
it checks, source/target, last run) → advise per rule: **reuse as-is / update–extend
(`update_rule`) / create new**, with reasoning. Only plan the checks not already covered.
Remember: some settings are create-time-only (`sortMode`) — an existing recon with the wrong sort
must be recreated, not patched.

### Step 4 — Build the check plan (mode playbook) and confirm
- **Migration:** the ordered battery from `migration-check-plan.md` — schema parity → row counts →
  uniqueness → row-by-row recon → target validation → referential integrity → freshness — scoped
  to this migration; the customer picks which steps this run includes.
- **Reconciliation:** grain analysis first, then select from `reconciliation-patterns.md` —
  totals tie-out (Checksum), aggregate agreement at the common grain (Recon with GROUP BY),
  row-level agreement only where grain truly matches, referential integrity, overlap, guardrail
  thresholds (Pushdown) — with tolerances encoded.

Present the plan per `conventions.md` §8 — for each check, lead with what it tests and the risk a
failure would mean, then the pre-assigned rule type and why. **Wait for confirmation and apply
edits.**

### Step 5 — Emit rule specs → hand to Build mode
For each approved check, produce a complete rule spec per `references/rule-spec.md`: resolved IDs,
datasets (table or SQL), join keys, checks, result types, tolerances — and for any cross-platform
recon, an explicit **`sortMode`** decision (prefer `none` + identical `ORDER BY` both sides; see
`cross-platform-recon.md` §1) since it cannot be changed later. Mark unresolved items in
`openQuestions`. Then hand the batch to **`icedq-author-rules` Build mode**, which validates,
creates, and confirms back. Build order: structure and count checks first, so an early mismatch
can reframe the rest of the plan.

### Step 6 — Run and report
With the customer's go-ahead: `execute_rules_or_workflows` → poll
`get_workflow_run_status_or_result` to completion → summarize in business terms. Read results
through the mode's lens: migration — orphans usually mean the target isn't fully loaded; every-row
"diffs" usually mean a comparison artifact; reconcile — see the interpretation guide in
`reconciliation-patterns.md`. Default to the exception-report link plus check-level stats
(`conventions.md` §9); pull row-level detail via `get_checks_exception_report` only on explicit
request. Deep analysis hands off to `icedq-run-and-report`.

### Step 7 — Close per mode
- **Migration:** a plain-language **certification** per table — what matched, what genuinely
  differs, what the customer must decide (e.g. "target added FIRSTNAME/LASTNAME — intended?",
  "CUSTOMERKEY lost its NOT NULL — add a NotNull validation on the target"). Offer to schedule the
  set as a pre-cutover gate.
- **Reconciliation:** group the rules into a workflow and set the recurring cadence via
  `icedq-schedule-and-monitor`; agree who reviews failures and how tolerances get tuned. The value
  compounds through the trend, not any single run.

## Communication
Lead with what the comparison means for the business — "all 28 columns arrived and every row
reconciles; two key columns lost their NOT-NULL" — and keep instance IDs and exit codes for those
who ask. See `references/conventions.md` §5.
