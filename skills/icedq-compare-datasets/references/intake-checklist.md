# Compare-datasets intake — requirements gathering

A comparison request usually arrives underspecified. "I am moving data from SQL Server to
Snowflake" names two engines and nothing else; "our warehouse should match billing" names two
systems and nothing else. Before you resolve a single ID or build a single rule, run this intake.
Two principles:

- **Ask in small, logical batches, not one wall of questions.** Group related questions (e.g. all
  the source-side details together), and skip anything the customer already stated.
- **Never guess a default for the customer's environment.** Connections, workspace, folder, and the
  exact table are their decisions. Where an answer is discoverable (a connection, an existing rule),
  offer to *search and present*, then let them confirm.

Capture the answers, echo a one-paragraph summary back, and confirm before moving on.

## Contents
- Mode gate — migration (certify) vs reconciliation (monitor)
- A. Seed artifacts (mapping doc / ETL code / neither)
- B. Source and target definition (DB or file, per side)
- C. iceDQ wiring (connections, workspace, folder)
- D. Existing-rule reuse
- E. Definition of "correct"
- Intake → plan handoff

## Mode gate — ask this first (skip if the opening prompt already answers it)

**"Is this a one-time move you're certifying, or an ongoing agreement you're monitoring?"**

- **Migration (certify):** the target is a *copy* of the source after a move; the work is finite
  and ends in a go/no-go. → plan from `migration-check-plan.md`; default expectation is exact
  equivalence (minus declared transformations).
- **Reconciliation (monitor):** two *related but different* systems must keep agreeing on totals,
  keys, or integrity; the work is recurring. → plan from `reconciliation-patterns.md`; grain
  analysis and tolerances are first-class; scheduling is part of the design.

Event language ("moved", "cutover", "before go-live", "after the migration") signals migration.
Steady-state language ("keep in sync", "nightly reconciliation", "should always match") signals
reconciliation. A migration in a long dual-run/parallel period is reconciliation until cutover —
say so and plan accordingly.

For **reconciliation mode**, also capture in section B: the **common grain** at which the two
sides should agree (transaction? day+account? invoice?), the **tolerances** the customer accepts
(amount/count deltas, timing cut-offs), and the intended **run cadence**.

## A. Seed artifacts — is there anything to derive the checks from?

Ask up front, because the answer changes *how* the rule bodies get built (the plan and ordering
still come from this skill):

1. **Mapping document?** (Excel/CSV/Word source-to-target spec.) If yes → the column-level checks
   can be seeded via **`icedq-mapping-doc-rules`**; bring the derived checks back into this plan.
2. **ETL / transformation code?** (SQL stored proc, dbt, PySpark, SSIS, Informatica, Airflow, ….)
   If yes → seed via **`icedq-etl-code-rules`**.
3. **Neither?** → the checks come from this skill's own playbook (`migration-check-plan.md` or
   `reconciliation-patterns.md` per the mode gate), optionally informed by profiling
   (`fetch_db_sample_data` → `profile_data` → `suggest_quality_checks`).

However the checks are derived, creation is always handed to **`icedq-author-rules` Build mode**
as rule specs (`rule-spec.md`) after the customer confirms the plan.

## B. Source and target definition — one block per side

For **each** side (source, then target), first ask: **database or file?**

**If a database:**
- Database **engine / type** (SQL Server, Snowflake, Oracle, Databricks, Postgres, …).
- **Database name** (or note the connection has no database hierarchy).
- **Schema name.**
- **Table name** (or a custom SQL query, if the "table" is really a query).

**If a file:**
- **File type** (flat-file/CSV, parquet, excel, json, xml, flat-file-sql).
- **File location / path** (and which iceDQ file connection it lives under).
- **File name.**

Note whether this is **cross-platform** (different engines) — if so, `cross-platform-recon.md`
applies to every comparison you build.

## C. iceDQ wiring — connections, workspace, folder

3. **Connections** — For each side, does the customer already have an iceDQ **connection**, or
   should you **search** for it?
   - Has one → resolve it by name via `list_connections` (use the `id`, never the name).
   - Wants you to search → match their B-block inputs (engine/DB/schema/table, or file
     type/location) against `list_connections(workspaceId)`, present the **ACTIVE** candidates with
     what each points at, and let them pick. Do not auto-select even on a single match — confirm.
4. **Workspace** — Which **workspace** should connections be searched in and rules created in?
   `list_workspaces` → confirm/select `workspaceId`. Everything downstream is scoped to it.
5. **Folder** — Which **folder** should the rules be created in? `list_folders(workspaceId,
   nameFilter=…)`. If none fits, propose a name (`<Table>_Migration_Tests`, alphanumeric +
   underscores) and `create_folder` only after approval.

## D. Existing-rule reuse — search before you create

6. **Search for existing rules?** Ask whether the customer wants you to check for rules that already
   cover this comparison. Default to yes — duplicate rules that check the same thing confuse
   ownership, results, and maintenance in any environment.
7. **If found, summarise and advise.** For each match (`list_rules(workspaceId, nameFilter=…)` →
   `get_rule`), present in plain language:
   - what it checks (rule type + columns/join key),
   - its source and target,
   - when it last ran and its last result.

   Then recommend, per rule, the better option **and why**:
   - **Reuse as-is** — already covers this check correctly; no action.
   - **Update / extend** — right rule, wrong scope: add a missing check, widen columns, fix a
     setting (e.g. `sortMode`, a NotNull) → `update_rule`.
   - **Create new** — no adequate match, or the existing rule is materially different.

   Only build the checks that aren't already covered.

## E. Definition of "correct"

8. **What counts as success?** Exact source=target match, or is the target allowed to **add**
   columns (e.g. splitting `FULLNAME` into `FIRSTNAME`/`LASTNAME`) or apply **transformations**
   (type/format changes, code remapping)? This decides which differences are findings and which are
   expected — and which comparisons need transformation-aware Custom checks.

## Intake → plan handoff

Once the intake is confirmed, proceed to resolve IDs, run the existing-rule check, then agree the
check plan from the mode's playbook (`migration-check-plan.md` or `reconciliation-patterns.md`).
Everything the customer supplied here — mode, object types, connections, workspace, folder, seed
artifacts, tolerances/grain (reconcile), and the definition of correct — flows into the rule specs
handed to Build mode, so **no question is ever asked twice**.
