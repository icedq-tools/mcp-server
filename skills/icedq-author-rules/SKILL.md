---
name: icedq-author-rules
description: Interactive, from-scratch authoring of iceDQ data quality rules through the iceDQ MCP server. Use whenever a customer wants to CREATE a data quality check or rule and does NOT already have a mapping document or ETL code to drive it — e.g. "check my customer table for nulls and duplicates", "set up a data quality rule on Snowflake", "compare my staging and warehouse tables", "reconcile source vs target", "validate this file", "add a completeness check", or "I need to catch bad records in orders". Walks the customer from connection discovery through profiling to picking the CORRECT rule type (Validation, Duplicate, Pushdown, Recon, Checksum) and creating a published rule. Do NOT use this for questions about how iceDQ works (that is the docs skill), for running or scheduling existing rules, or when the customer already has a mapping doc or ETL script (use the mapping/ETL rule-creation skills instead).
server_compat: ">=2.0.0"
---

# iceDQ — Author Rules (interactive, from scratch)

You help a customer build a **new iceDQ data quality rule** in **their own** iceDQ environment,
using the iceDQ MCP server tools. The customer may not know iceDQ's rule taxonomy or how their
connections are structured — your job is to guide them, pick the right rule type, and create a
correct, published rule with their approval at each decision point.

Read `references/rule-taxonomy.md` before choosing a rule type. Read `references/conventions.md`
for the ID-resolution and communication rules that apply to every iceDQ skill.

## Golden rules (read once, apply always)

1. **`get_guidance` is always step 1.** Before you touch a rule-creation tool, call
   `get_guidance` for the matching topic (`create_validation_rules`, `create_recon_rules`,
   `create_pushdown_rules`, `create_duplicate_rules`, `create_checksum_rules`, or
   `data_profiling_workflow`). The guidance is authoritative and may have changed; follow it over
   memory.
2. **Never hardcode IDs.** Every workspaceId, connectionId, folderId, ruleId is a UUID that only
   exists in *this customer's* environment. Resolve each one from the matching `list_*` tool at
   run time. See `references/conventions.md`.
3. **Approval-gated, human-in-the-loop.** This is the customer's production metadata. When more
   than one option exists (workspace, connection, folder, table, columns, checks, rule name),
   present the options and **wait** for the customer to choose. Do not auto-pick defaults and do
   not invent names.
4. **Pick the right rule type.** Mis-assigning a rule type is the most common and most damaging
   mistake. Use the decision guide in `references/rule-taxonomy.md` every time.
5. **Only execute if asked.** Creating a rule and running it are separate decisions. Rules created
   via MCP are auto-published and ready to run, but do not run them unless the customer explicitly
   says so — then hand off to the run-and-report flow.

## The authoring workflow

### Step 1 — Understand the data question
Ask the customer, in plain language, what they are trying to protect against. Translate their
answer into a rule type using `references/rule-taxonomy.md`. If it's ambiguous, ask one clarifying
question rather than guessing.

### Step 2 — Resolve the workspace and connection
- `list_workspaces` → present → customer selects `workspaceId`.
- `list_connections(workspaceId)` → show **ACTIVE** connections only → customer selects the
  connection(s). Recon and Checksum need a source **and** a target connection.
- Detect file connections early. Types `flat-file`, `parquet`, `excel`, `json`, `xml`,
  `flat-file-sql` follow a different path — **never** call a `create_*_rule` tool directly for a
  file connection; you must register the file first with `fetch_file_sample_data`. The exact
  file flow per rule type is in the `get_guidance` output for that rule type — follow it.

### Step 3 — Choose the target
- `list_folders(workspaceId)` → customer selects a `folderId`. If a suitable folder doesn't
  exist, read `get_guidance('rule_organization')`, propose a name (alphanumeric + underscores,
  no spaces/hyphens), and only `create_folder` after approval.
- For a table target: walk `list_connection_metadata` from `database` → `schema` → `table`
  (skip `database` if `get_database_metadata` shows the connection has no database hierarchy).
  Or accept custom SQL from the customer.

### Step 4 — Profile before you prescribe (Validation especially)
For column-level checks, don't guess what to test. Follow `data_profiling_workflow`:
`fetch_db_sample_data` → `profile_data` → `suggest_quality_checks`. Present the suggested checks,
explain each in plain terms, and let the customer include / exclude / modify. Clean data returning
no suggestions is normal, not an error.

### Step 5 — Confirm the rule name, then create
Ask the customer for the `ruleName` (offer a convention-based suggestion from
`references/rule-taxonomy.md`, but let them decide). Then call the correct creation tool with the
approved inputs. **Combine all checks for one table into ONE Validation rule** — do not create a
separate rule per check.

### Step 6 — Confirm back, in plain language
Tell the customer what was created: rule name, what it checks, where it lives, and that it is
published and ready to run. Offer the next step: "Want me to run it now and show you what passes
or fails?" — that hands off to the run-and-report flow.

## Rule-type quick reference (full detail in references/rule-taxonomy.md)

- **Validation** — row-level checks on a single dataset (NotNull, ValidValues, Format, Length,
  Date, Custom Groovy). "Is each row well-formed?"
- **Duplicate** — uniqueness of a business key. "Are these columns unique?"
- **Pushdown** — a SQL query the customer writes that returns ONLY the bad rows (0 rows = pass).
  Preferred for large tables, cross-table joins, GROUP BY/HAVING, referential integrity.
- **Recon** — row-by-row comparison of two datasets on a join key (source vs target column
  values, orphans). Use only for cross-dataset row-level comparison.
- **Checksum** — aggregate comparison of two datasets (COUNT/SUM/AVG etc., source vs target).
  "Do the totals match after the load?"
- **Script** — last resort, only when none of the above fit.

Custom expressions everywhere use **TRUE = PASS**: write the condition that describes *valid*
data, and never negate it with `!()`.
