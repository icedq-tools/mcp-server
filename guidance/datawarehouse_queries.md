## WHEN TO USE DATAWAREHOUSE TOOLS

✅ USE for analytical/aggregate queries (triggers: summary, report, analysis, trend, count by, group by, top N, average, breakdown, comparison, KPI, dashboard):
- "Give analysis report of recon/validation/duplicate rule" (any rule TYPE)
- "How many rules failed last week grouped by folder/ruleType?"
- "Top 10 rules by failure count in last 30 days"
- "Pass/fail trend per day" / "average execution time over time"
- Check-level aggregates: filter `executable_type = 'check'` in execution_fct

❌ DO NOT USE for:
- Flat list / single id lookup → use list_* tools (list_workspaces, list_rules, etc.)
- Row-level failures of specific rule/run → use exception_report_analysis tools

CRITICAL: "analysis report of [rule TYPE]" = datawarehouse | "exception report for [specific RULE NAME]" = exception tools

## AVAILABLE DATASETS (always confirm exact columns via datawarehouse_query_schema — this is a map, not the source of truth)

Fact tables (rows = events; support `metrics`/aggregation):
- **execution_fct** — one row per rule/check execution. The main table for run analysis, pass/fail rollups, trends.
- **user_login_fct** — one row per login attempt. Login/security audit (Example 9).
- **execution_connection_link** / **object_connection_link** — link tables (execution↔connection, rule↔connection); not useful as a base, only via their joins (see below).

Dimension tables (rows = entities; own metadata, usually queried alone or joined in as a **filter only** — see Known Data Quirks §3):
- **object_dim** — rules and checks (their definitions, not runs). Name/type/subtype lookups (Example 5).
- **executable_dim** — configured instances of rules/checks (schedule/connection bindings); mostly a join hop between object_dim and execution_fct.
- **workspace_dim**, **account_dim** — workspace/account metadata. Single-row-ish lookups; workspace_id is always server-injected so these can't be used to cross workspace boundaries.
- **folder_dim** — folder metadata.
- **connection_dim** — connection metadata (name, connector type).
- **user_dim** — user metadata (username, email).
- **parameter_dim** — parameter metadata.

Named joins connect these (10 total — see `datawarehouse_query_schema` for the exact list); the ones exercised in this guide's examples are `executables_with_objects`, `executions_with_executables` (both used for the ID→name fallback pattern in Known Data Quirks §2/§4) and `executions_with_connections` (Example 10). Every join is filter-only: it can never contribute a `dimensions` or `metrics` column, regardless of direction or chain length (Known Data Quirks §3).

## MANDATORY 3-STEP WORKFLOW

NEVER skip steps. NEVER guess field names.

1. **datawarehouse_query_schema** — get dataset/column/metric/join/operator names
2. **validate_and_explain_structured** — dry-run (returns SQL, no execution)
3. **datawarehouse_query_executor** — execute and return rows

RULE: If user request is ambiguous → show schema options and WAIT for confirmation.
RULE: NO raw SQL. All fields must match schema exactly.

## PAYLOAD STRUCTURE

All fields sourced from datawarehouse_query_schema:

**dataset** (required): Dataset key from schema (e.g., execution_fct, object_dim)

**dimensions**: Pass-through columns. With metrics → included in GROUP BY
- Example: ["execution_status", "executable_type", "folder_id"]
- ⚠️ DIMENSIONS MUST BE COLUMNS OF THE PRIMARY DATASET ONLY. Columns from joined tables (e.g., object_name from object_dim, executable_name from executable_dim, folder_name from folder_dim) cannot be used as dimensions — they will be rejected with "Unknown dimension column". Joined table columns are only usable as FILTERS.

**metrics**: Aggregations. MUST have {column, agg, alias}
- agg: count, sum, avg, min, max, count_distinct
- alias: required (used in order_by)
- Example: [{"column": "instance_id", "agg": "count", "alias": "runCount"}]
- ⚠️ METRICS MUST ALSO BE COLUMNS OF THE PRIMARY DATASET ONLY — same restriction as dimensions. A metric column from a joined table is rejected with "Unknown metric column". Joins only narrow rows via filters; they never make a joined table's columns available to dimensions or metrics, regardless of which table is the base or how many joins are chained.

**filters**: Row filters. Each: {column, op, value}
- Operators: eq, neq, gt, gte, lt, lte, in, not_in, like, ilike, is_null, is_not_null
- Example: [{"column": "execution_status", "op": "eq", "value": "warning"}]
- ⚠️ DO NOT add workspace_id as a filter — the server auto-injects it. Adding it explicitly causes it to be applied against the joined table's workspace_id column, which may silently filter out all rows.

**time_column + time_window_days**: Optional as a PAIR, but time filtering is never truly off — see Known Data Quirks §6
- time_column must have is_time_col=true in schema
- time_window_days: 1-365 (default 30) — 365 is a HARD CEILING, there is no way to query further back
- Looks back N days from NOW
- ⚠️ Omitting `time_column` does NOT mean "no time filter" — the server silently applies `time_window_days` against the dataset's FIRST timestamp column instead (e.g. `created_dttm` for `object_dim`). Confirmed live to cause a 15x undercount on an unbounded-looking listing query. ALWAYS check the `warnings` array in the response — this is the only place the substitution is surfaced. See Known Data Quirks §6.

**order_by**: [{column, direction}] — column = dimension, metric alias, or derived_column

**limit**: 1-500 (default 100) — use small limit + order_by for top-N

**joins**: Named joins from schema. [{join_name}] — do NOT invent syntax

**derived_columns**: Named expressions from schema — reference BY NAME only
- Currently 2, both on `execution_fct`: `execution_outcome` (collapses `execution_status` to success/failure/error/other) and `check_run_status` (collapses `error_count`/`failure_count` to error/failure/success, only meaningful where `executable_type = 'check'`)
- ⚠️ When combined with `metrics` (which forces GROUP BY on all `dimensions`), every base column the derived expression reads MUST also be listed in `dimensions`, or the query fails with a Postgres GROUP BY error. See Known Data Quirks §5.

## KNOWN DATA QUIRKS — READ BEFORE FILTERING

### 1. object_sub_type casing is inconsistent
Always use `in` with all case variants — never a single `eq` value:
- Recon: `["Recon", "recon", "api-recon"]`
- Validation: `["Validation", "validation", "api-validation"]`
- Checksum: `["Checksum", "checksum"]`
- Duplicate: `["Duplicate", "duplicate"]`
- Pushdown: `["Pushdown", "pushdown", "ValidationPushdown"]`

### 2. Join chain may return 0 rows
`executions_with_executables` + `executables_with_objects` can return 0 rows if `executable_dim` is unpopulated for the workspace. **Mandatory fallback sequence:**
1. Re-run WITHOUT joins — if rows appear, join chain is broken → continue below.
2. Query `object_dim` for rule `object_id` values of the target rule type.
3. Filter `execution_fct.executable_id` using those IDs via `in`.
4. If still 0 → call `get_rule_workflow_run_history` per rule and aggregate manually.
⛔ NEVER report "no executions found" without completing all 4 steps.

### 3. Dimensions AND metrics are primary-dataset-only
Only columns of the base `dataset` are valid as `dimensions` **or** `metrics` — this restriction applies to both, not just dimensions. Joined table columns (`object_name`, `folder_name`, `executable_name`, or a joined table's own aggregatable columns) are **filter-only**: using one as a dimension returns `"Unknown dimension column"`, using one as a metric returns `"Unknown metric column"`. There is no join direction or join-chain length that lifts this — confirmed live in both directions: `object_dim` as base cannot use `execution_fct`'s `instance_id`/`failure_count` as metrics, and `execution_fct` as base cannot use `object_dim`'s `object_name` as a dimension, even via the same two-hop join chain. Use `executable_id` / `folder_id` / `object_id` as dimensions and resolve human-readable names separately via `list_rules` / `get_rule` / `list_folders`.

### 4. Getting rule/object names alongside execution metrics — not possible in one query
There is no single structured query that returns both a human-readable name (e.g. `object_name` from `object_dim`) and an execution metric (e.g. `instance_id`/`failure_count` from `execution_fct`) together. Flipping which table is the base dataset does not help — §3 applies symmetrically regardless of base/join direction.

**Correct pattern — resolve names in a separate step:**
1. Aggregate on `execution_fct`, using the opaque `executable_id` as the dimension (see Example 2 under EXAMPLES below).
2. Resolve the names for those IDs separately — `list_rules(workspaceId)` or `get_rule` for a single rule — and merge by ID yourself when presenting results. Do not attempt to build one query that projects both; it will fail with `"Unknown dimension column"` or `"Unknown metric column"` depending on which table is chosen as the base.

### 5. derived_columns + metrics: the derived column's source columns must be in dimensions too
Confirmed live: `execution_outcome` (reads `execution_status`) combined with a `metrics` aggregate and `dimensions: ["executable_type"]` alone fails at execution (not at dry-run explain — `validate_and_explain_structured` does NOT catch this) with:
`ERROR: column "ef.execution_status" must appear in the GROUP BY clause or be used in an aggregate function`.
This happens because `metrics` forces `GROUP BY` on exactly the listed `dimensions`, and the derived expression's underlying column isn't one of them. **Fix: add the derived column's source column(s) to `dimensions`** — e.g. add `execution_status` when using `execution_outcome`, or `error_count`+`failure_count` when using `check_run_status` — so it's part of the GROUP BY. This does still return distinct rows per source-column value (e.g. one row per `execution_status`, not fully collapsed to just the outcome), which is usually what you want anyway (Example 7 below).
For row-level, non-aggregated use (no `metrics` at all — see Example 8), there is no GROUP BY and this restriction does not apply.

### 6. time_column is never truly optional, and 365 days is a hard ceiling
Omitting `time_column` does NOT skip time filtering. The server silently applies `time_window_days` (default 30) against the FIRST timestamp column in the dataset's schema (e.g. `created_dttm` for `object_dim`, `folder_dim`, `connection_dim`, `user_dim`, `workspace_dim`, `account_dim`, `parameter_dim` — every dimension table has one). This shows up only as a `warnings` entry, never an error — a query that looks like an unbounded listing can silently return a small fraction of the real data.

**Confirmed live:** an `object_dim` count query with no `time_column` returned **60** rows; the identical query with `time_column: "created_dttm", time_window_days: 365` returned **902** — a 15x difference, invisible unless you read the `warnings` array.

Worse, `time_window_days` has a hard maximum of 365 (enforced by the tool's own input schema) — there is no parameter combination that reaches further back than one year. Any object created or updated more than 365 days ago is genuinely invisible to these tools; this is a backend limitation, not a fixable query mistake.

**Practical guidance:**
- ALWAYS read the `warnings` array on every response, even a successful one — it's the only place a silent default surfaces.
- For a rule/connection/folder LISTING or COUNT that must be complete regardless of age, do not use datawarehouse tools at all — use `list_rules` / `list_connections` / `list_folders` (paginated, no time restriction). This is the same rule already stated in WHEN TO USE ("flat list → use list_* tools"), but the reason is sharper than convenience: it's a correctness requirement.
- If a datawarehouse query against a dimension table is unavoidable, always pass `time_column` + `time_window_days: 365` explicitly, and tell the customer the result may be missing anything older than a year.

### 7. A filter column that exists on both the base dataset and a joined table can silently resolve to the WRONG one
`is_deleted` exists on `object_dim` (the base) AND `connection_dim` (joined via `objects_with_connections`). Confirmed live: filtering by `is_deleted` while that join is present resolved to the **joined table's** column (`cd.is_deleted`), not the base dataset's (`od.is_deleted`) — even though the intent was almost certainly to filter out deleted rules, not deleted connections:
```
-- filters: [{"column": "is_deleted", "op": "eq", "value": 0}, {"column": "conn_name", "op": "eq", "value": "..."}]
WHERE ... AND cd.is_deleted = :p_f1 AND cd.conn_name = :p_f2   -- is_deleted silently applied to connection_dim, not object_dim
```
A column name that exists on only ONE table in the join (e.g. `object_type`, only on `object_dim`; `conn_name`, only on `connection_dim`) resolves correctly and unambiguously — the risk is specifically when the SAME column name exists on more than one table in the join chain (`is_deleted`, `workspace_id`, `create_dttm`/`update_dttm`, and similar generic columns are common across nearly every dimension table).

**Practical guidance:**
- Whenever a query joins two tables that could share a column name (check both tables' column lists from `datawarehouse_query_schema` first), **always inspect the `sql` field** returned by `validate_and_explain_structured` before executing — confirm the filter landed on the table alias you intended (e.g. `od.is_deleted` vs `cd.is_deleted`).
- If a shared column name must be filtered on the joined table specifically (not the base), there is no way to qualify it in the payload (filters take a bare column name, no table prefix) — the resolution behavior is implicit and not configurable. Do not assume "the base dataset's column always wins."

## EXAMPLES

### 1. Count rule runs grouped by status (correct column names)
```json
{
  "dataset": "execution_fct",
  "dimensions": ["execution_status"],
  "metrics": [{"column": "instance_id", "agg": "count", "alias": "runCount"}],
  "filters": [{"column": "executable_type", "op": "eq", "value": "rule"}],
  "time_column": "executed_dttm",
  "time_window_days": 7,
  "order_by": [{"column": "runCount", "direction": "desc"}],
  "limit": 50
}
```

### 2. Top N rules by failure count (correct column names)
```json
{
  "dataset": "execution_fct",
  "dimensions": ["executable_id", "execution_status"],
  "metrics": [{"column": "failure_count", "agg": "sum", "alias": "totalFailures"}],
  "filters": [{"column": "executable_type", "op": "eq", "value": "rule"}],
  "time_column": "executed_dttm",
  "time_window_days": 30,
  "order_by": [{"column": "totalFailures", "direction": "desc"}],
  "limit": 10
}
```

### 3. Daily trend of runs and failures (correct column names)
```json
{
  "dataset": "execution_fct",
  "dimensions": ["executed_dttm"],
  "metrics": [
    {"column": "instance_id", "agg": "count", "alias": "runs"},
    {"column": "failure_count", "agg": "sum", "alias": "failures"}
  ],
  "filters": [{"column": "executable_type", "op": "eq", "value": "rule"}],
  "time_column": "executed_dttm",
  "time_window_days": 14,
  "order_by": [{"column": "executed_dttm", "direction": "asc"}]
}
```

### 4. Check-level analysis (executable_type filter)
```json
{
  "dataset": "execution_fct",
  "dimensions": ["parent_instance_id", "executable_id"],
  "metrics": [
    {"column": "instance_id", "agg": "count", "alias": "checks"},
    {"column": "failure_count", "agg": "sum", "alias": "failures"}
  ],
  "filters": [{"column": "executable_type", "op": "eq", "value": "check"}],
  "time_column": "executed_dttm",
  "time_window_days": 30
}
```

### 5. List recon rules in a workspace (object_dim — correct column names + casing fix)
⚠️ Prefer `list_rules` for this — it's a flat listing with no time restriction (Known Data Quirks §6).
Use this pattern only when the recon rules need to be combined with other datawarehouse output in
the same conversation. `time_column`/`time_window_days: 365` are set explicitly and to the maximum
allowed — without them, rules created over 30 days ago would silently vanish (§6):
```json
{
  "dataset": "object_dim",
  "dimensions": ["object_id", "object_name", "object_sub_type"],
  "filters": [
    {"column": "object_type", "op": "eq", "value": "rule"},
    {"column": "is_deleted", "op": "eq", "value": 0},
    {"column": "object_sub_type", "op": "in", "value": ["Recon", "recon", "api-recon"]}
  ],
  "time_column": "created_dttm",
  "time_window_days": 365,
  "limit": 100
}
```
Even with `time_window_days: 365`, this misses any recon rule created more than a year ago — tell
the customer if that's a possibility for their workspace.

### 6. Recon rule analysis — breakdown by status (join chain fallback pattern)
When the join chain is broken (returns 0 rows), query execution_fct without joins,
then use rule IDs from object_dim as an executable_id filter:
```json
{
  "dataset": "execution_fct",
  "dimensions": ["execution_status"],
  "metrics": [{"column": "instance_id", "agg": "count", "alias": "runCount"}],
  "filters": [
    {"column": "executable_type", "op": "eq", "value": "rule"},
    {"column": "executable_id", "op": "in", "value": ["rule-uuid-1", "rule-uuid-2"]}
  ],
  "time_column": "executed_dttm",
  "time_window_days": 7,
  "order_by": [{"column": "runCount", "direction": "desc"}]
}
```

### 7. Simplified pass/fail rollup using a derived_column (execution_outcome + metrics)
Collapses the 6 raw `execution_status` values into success/failure/error/other. Note `execution_status`
is listed in `dimensions` alongside `executable_type` even though only `execution_outcome` is meant to be
read — required per Known Data Quirks §5, since `metrics` forces GROUP BY on the listed dimensions and
the derived expression reads `execution_status`:
```json
{
  "dataset": "execution_fct",
  "dimensions": ["executable_type", "execution_status"],
  "derived_columns": ["execution_outcome"],
  "metrics": [{"column": "instance_id", "agg": "count", "alias": "n"}],
  "filters": [{"column": "executable_type", "op": "eq", "value": "rule"}],
  "time_column": "executed_dttm",
  "time_window_days": 60,
  "order_by": [{"column": "n", "direction": "desc"}]
}
```

### 8. Row-level check outcomes with check_run_status (no metrics — no GROUP BY restriction)
Row-level detail (no `metrics`), so the derived column's source columns don't need to be listed in
`dimensions` — Known Data Quirks §5's GROUP BY restriction only applies when `metrics` is present:
```json
{
  "dataset": "execution_fct",
  "dimensions": ["executable_id", "parent_instance_id"],
  "derived_columns": ["check_run_status"],
  "filters": [{"column": "executable_type", "op": "eq", "value": "check"}],
  "time_column": "executed_dttm",
  "time_window_days": 7,
  "limit": 100
}
```

### 9. Login audit — failed logins by type (user_login_fct, no join needed)
`user_login_fct` is a standalone fact table with its own dimensions — no join required for a login
security/audit report:
```json
{
  "dataset": "user_login_fct",
  "dimensions": ["login_status", "login_type"],
  "metrics": [{"column": "login_id", "agg": "count", "alias": "loginCount"}],
  "time_column": "login_dttm",
  "time_window_days": 30,
  "order_by": [{"column": "loginCount", "direction": "desc"}]
}
```

### 10. Runs against a specific connection (join used correctly — filter only, not projection)
Demonstrates the correct use of a join per Known Data Quirks §3: `executions_with_connections`
narrows rows to a `conn_id` from `connection_dim`, but every projected column (`executable_type`,
`instance_id`) still comes from the base dataset `execution_fct`:
```json
{
  "dataset": "execution_fct",
  "joins": [{"join_name": "executions_with_connections"}],
  "dimensions": ["executable_type"],
  "metrics": [{"column": "instance_id", "agg": "count", "alias": "runCount"}],
  "filters": [{"column": "conn_id", "op": "eq", "value": "<connId from list_connections>"}],
  "time_column": "executed_dttm",
  "time_window_days": 30
}
```

### 11. Rule count per folder (object_dim, own columns only)
`folder_id` is one of `object_dim`'s own columns, so this needs no join. `time_column`/`time_window_days: 365`
are explicit per Known Data Quirks §6 — folders can easily hold rules created over 30 days ago:
```json
{
  "dataset": "object_dim",
  "dimensions": ["folder_id"],
  "metrics": [{"column": "object_id", "agg": "count_distinct", "alias": "ruleCount"}],
  "filters": [{"column": "object_type", "op": "eq", "value": "rule"}, {"column": "is_deleted", "op": "eq", "value": 0}],
  "time_column": "created_dttm",
  "time_window_days": 365,
  "order_by": [{"column": "ruleCount", "direction": "desc"}]
}
```
Resolve `folder_id` to a human-readable name afterward via `list_folders` (same reasoning as Known Data Quirks §4).

### 12. Rules configured on a specific connection (object_dim + objects_with_connections, filter-only join)
Lists rules by name that use a given connection. Deliberately filters on `conn_name` (exists only on
`connection_dim`) and `object_type` (exists only on `object_dim`) — never `is_deleted`, which exists on
BOTH tables and would risk the ambiguous resolution in Known Data Quirks §7:
```json
{
  "dataset": "object_dim",
  "joins": [{"join_name": "objects_with_connections"}],
  "dimensions": ["object_id", "object_name", "object_type"],
  "filters": [{"column": "object_type", "op": "eq", "value": "rule"}, {"column": "conn_name", "op": "eq", "value": "<connection name>"}],
  "time_column": "created_dttm",
  "time_window_days": 365,
  "limit": 100
}
```
If you also need to exclude deleted rules, check the generated SQL from `validate_and_explain_structured`
first to confirm `is_deleted` resolved to `od.is_deleted` and not `cd.is_deleted` (Known Data Quirks §7)
before executing.

## ANTI-PATTERNS — DO NOT

❌ Invent dataset/column/join names → use exact names from schema
❌ Pass raw SQL → tools reject it
❌ Metrics without alias → order_by breaks
❌ time_window_days without time_column → filter has no target
❌ Large limit for top-N → use order_by + small limit
❌ Skip validate_and_explain_structured → non-trivial queries fail
❌ Use list_* tools for aggregates → they cannot group/count/trend
❌ Use joined table columns as dimensions OR metrics → both are rejected; only primary dataset columns allowed, regardless of which table is the base or how many joins are chained
❌ Add workspace_id as an explicit filter → server auto-injects it; adding it applies it to joined table columns and may return 0 rows
❌ Filter object_sub_type with a single case value → use `in` with all case variants (see Known Data Quirks §1)
❌ Use columns like ruleType, folderName, ruleName, runStartTime, runDate — these do NOT exist in the schema
❌ Combine derived_columns with metrics without also listing the derived column's source columns in dimensions → GROUP BY error at execution time, not caught by validate_and_explain_structured (see Known Data Quirks §5)
❌ Omit time_column and assume "no time filter" → the server silently applies a 30-day default against the dataset's first timestamp column, which can undercount results by an order of magnitude with no error (see Known Data Quirks §6)
❌ Filter on a column name that exists on both the base dataset and a joined table without checking the generated SQL → it may resolve to the wrong table's column (see Known Data Quirks §7)

## COMMON ERRORS

**"Unknown dataset"** → dataset key doesn't match schema → re-run datawarehouse_query_schema, copy exact key
**"Unknown dimension/metric column"** → column doesn't exist in the PRIMARY dataset → check spelling/case in schema; joined table columns cannot be used as dimensions OR metrics, only as filters (see Known Data Quirks §3)
**"Unsupported operator"** → op not allowed for column type → use operators from schema
**"Missing alias on metric"** → every metric MUST have alias
**"time_window_days without time_column"** → both required together
**Empty result with joins** → diagnose: run same query WITHOUT joins first; if that returns rows, the join chain is broken — use fallback procedure in Known Data Quirks §2
**Empty result without joins** → widen time_window_days, relax filters, or confirm data exists in period
**"column ... must appear in the GROUP BY clause or be used in an aggregate function"** → a `derived_columns` entry combined with `metrics` is reading a base column not listed in `dimensions` → add that column to `dimensions` (Known Data Quirks §5). This is a real execution-time failure that `validate_and_explain_structured` will NOT catch — always be ready for it on any derived_columns + metrics query.
