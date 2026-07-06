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
- Example: ["ruleType", "folderName", "status"]

**metrics**: Aggregations. MUST have {column, agg, alias}
- agg: count, sum, avg, min, max
- alias: required (used in order_by)
- Example: [{"column": "ruleRunId", "agg": "count", "alias": "runCount"}]

**filters**: Row filters. Each: {column, op, value}
- Operators: eq, neq, gt, gte, lt, lte, in, like
- Example: [{"column": "status", "op": "eq", "value": "Failed"}]

**time_column + time_window_days**: Both required together
- time_column must have is_time_col=true in schema
- time_window_days: 1-365 (default 30)
- Looks back N days from NOW

**order_by**: [{column, direction}] — column = dimension, metric alias, or derived_column

**limit**: 1-500 (default 100) — use small limit + order_by for top-N

**joins**: Named joins from schema. [{join_name}] — do NOT invent syntax

**derived_columns**: Named expressions from schema — reference BY NAME only

## EXAMPLES

### 1. Count by dimension (group-by)
```json
{
  "dataset": "execution_fct",
  "dimensions": ["ruleType"],
  "metrics": [{"column": "ruleRunId", "agg": "count", "alias": "runCount"}],
  "time_column": "runStartTime",
  "time_window_days": 7,
  "order_by": [{"column": "runCount", "direction": "desc"}],
  "limit": 50
}
```

### 2. Top N rules by failure count
```json
{
  "dataset": "execution_fct",
  "dimensions": ["ruleName", "folderName"],
  "metrics": [{"column": "failureCount", "agg": "sum", "alias": "totalFailures"}],
  "filters": [{"column": "status", "op": "eq", "value": "Failed"}],
  "time_window_days": 30,
  "order_by": [{"column": "totalFailures", "direction": "desc"}],
  "limit": 10
}
```

### 3. Daily trend
```json
{
  "dataset": "execution_fct",
  "dimensions": ["runDate"],
  "metrics": [
    {"column": "ruleRunId", "agg": "count", "alias": "runs"},
    {"column": "failureCount", "agg": "sum", "alias": "failures"}
  ],
  "time_column": "runStartTime",
  "time_window_days": 14,
  "order_by": [{"column": "runDate", "direction": "asc"}]
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
  "time_window_days": 30
}
```

### 5. Filtered pass-through (no aggregation)
```json
{
  "dataset": "object_dim",
  "dimensions": ["ruleId", "ruleName", "ruleType"],
  "filters": [{"column": "ruleType", "op": "in", "value": ["Validation", "Duplicate"]}],
  "limit": 100
}
```

## ANTI-PATTERNS — DO NOT

❌ Invent dataset/column/join names → use exact names from schema
❌ Pass raw SQL → tools reject it
❌ Metrics without alias → order_by breaks
❌ time_window_days without time_column → filter has no target
❌ Large limit for top-N → use order_by + small limit
❌ Skip validate_and_explain_structured → non-trivial queries fail
❌ Use list_* tools for aggregates → they cannot group/count/trend

## COMMON ERRORS

**"Unknown dataset"** → dataset key doesn't match schema → re-run datawarehouse_query_schema, copy exact key
**"Unknown column"** → column doesn't exist → check spelling/case in schema, or add join
**"Unsupported operator"** → op not allowed for column type → use operators from schema
**"Missing alias on metric"** → every metric MUST have alias
**"time_window_days without time_column"** → both required together
**Empty result** → widen time_window_days, relax filters, or confirm data exists in period
