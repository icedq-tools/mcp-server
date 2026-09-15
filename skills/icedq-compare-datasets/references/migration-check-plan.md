# Migration check plan — what to test, in what order, with which rule type

A migration is not one check; it is a **sequence** of checks, each answering a different question,
each mapped to a specific iceDQ rule type. Run them cheapest-gate-first: a schema or count problem
explains most downstream "failures" and is far cheaper to find than a full row-by-row diff.

The rule-type mapping below is binding. Do not collapse everything into a single Recon.

## Phase 0 — Structure (run first)

| # | Check | Rule type | Why |
|---|---|---|---|
| 1 | **Schema / metadata parity** — compare `INFORMATION_SCHEMA.COLUMNS` (column names, nullability, and where comparable, types/lengths) source vs target, joined on column name | **Recon** | Validates the *shape* before you trust any data. Catches dropped/renamed columns and NOT-NULL→nullable drift. See `cross-platform-recon.md` for the join-key and type-comparison caveats. |

## Phase 1 — Completeness

| # | Check | Rule type | Why |
|---|---|---|---|
| 2 | **Row-count reconciliation** — `COUNT(*)` source vs target | **Checksum** | The #1 migration failure is dropped or duplicated rows; fastest signal. |
| 3 | **Volume floor** — target row count below an expected minimum | **Pushdown** (threshold; 0 rows = pass) | Guards against an empty or badly-truncated load. |

## Phase 2 — Uniqueness

| # | Check | Rule type | Why |
|---|---|---|---|
| 4 | **Key uniqueness** — no duplicate business key in the target | **Duplicate** | Cloud targets (Snowflake, BigQuery, Databricks) do not enforce primary keys; a re-run or bad join can duplicate rows the source PK would have blocked. |
| 5 | **No unexpected overlap** — intersection `A ∩ B` of sets that must be mutually exclusive | **Recon** (intersection) | Catches duplication across load batches, or test/dummy rows leaking into the migrated set. |
| 6 | **SCD-2 current-row uniqueness** *(if the target is a versioned dimension)* — more than one open (`end_date IS NULL`) row per key | **Pushdown** | A versioned dimension can end up with multiple "current" rows per key — invisible to a plain duplicate check. |

## Phase 3 — Reconciliation (the authoritative check)

| # | Check | Rule type | Why |
|---|---|---|---|
| 7 | **Row-by-row reconciliation** — Diff Join on the business key, compare every mapped column | **Recon** | Counts and sums can both pass while individual values are wrong. Proves each row migrated faithfully and surfaces source-only / target-only orphans plus the exact differing columns. This is iceDQ's documented SQL Server→Snowflake pattern (UC15). |
| 8 | **Transformation-aware compares** *(inside the recon)* — wrap columns whose type/format changed (`toString()`, date `format()`) | **Recon** (Custom check) | Type changes across platforms (e.g. `bigint`→`varchar`, `date`→`varchar`) register as false mismatches unless normalised. |
| 9 | **Aggregate reconciliation** — `SUM()` of key numeric columns; `COUNT(DISTINCT key)` | **Checksum** | Fast totals tie-out that catches systematic value corruption (a truncated decimal, a bad CAST) without a full scan. |

## Phase 4 — Target validation (enforce the contract)

| # | Check | Rule type | Why |
|---|---|---|---|
| 10 | **Mandatory-field completeness** — NotNull on required columns | **Validation** | ETL joins/defaults can introduce nulls not present in the source; the target contract must hold. Directly relevant when schema parity (#1) shows a column lost its NOT-NULL. |
| 11 | **Domain / format / length** — ValidValues on codes; email/phone/ID patterns; length within the target column size | **Validation** | Type/length changes cause silent truncation; code remapping can produce out-of-domain values. |
| 12 | **Date validity & format** — valid dates in the expected format | **Validation** | Source string/`DATETIME` → target `DATE` can shift or lose values. |

## Phase 5 — Referential integrity

| # | Check | Rule type | Why |
|---|---|---|---|
| 13 | **Orphan / FK resolution** — child keys not present in the parent (`A − B`, or `LEFT JOIN … WHERE parent IS NULL`) | **Recon** (A−B) or **Pushdown** | Migrations move tables at different times; orphaned rows are a classic post-migration defect. Prefer Pushdown once tables are large. |

## Phase 6 — Operational

| # | Check | Rule type | Why |
|---|---|---|---|
| 14 | **Freshness / stale-load** — target load timestamp older than N days | **Pushdown** (threshold) | Confirms the target reflects the current migration run, not a stale/partial load. |

## Rule-type quick reference

- **Validation** — row-level checks on ONE dataset (NotNull, ValidValues, Length, Pattern, Date).
- **Duplicate** — uniqueness of column(s) in one dataset.
- **Recon** — row-by-row (or `GROUP BY`-aggregated) comparison of TWO datasets.
- **Checksum** — single-value comparison of two datasets (one row, one column each).
- **Pushdown** — SQL that returns ONLY failing rows (0 = pass); preferred for large tables, joins,
  `GROUP BY/HAVING`, referential integrity, and thresholds.
- **Script** — last resort only.

Custom expressions everywhere use **TRUE = PASS**: write the condition that describes *valid* data,
and never negate it with `!()`.

## Grounding (iceDQ docs use cases)

- UC15 — validate tables after data migration (SQL Server ↔ Snowflake) — the row-by-row recon pattern.
- UC7 — compare source and target DB schemas — the schema-parity recon.
- UC6 — referential integrity (A−B). UC16 — common records (A∩B).
- UC3 — row-count reconciliation. UC10 — verify date format. UC2 — find duplicate rows.

These reference numbers exist in the `icedq-docs` skill; consult it for step-by-step walkthroughs.
