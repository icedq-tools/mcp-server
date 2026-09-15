---
name: icedq-etl-code-rules
description: Uses ETL/transformation code provided by the user (SQL stored procedures, dbt, PySpark, Spark Scala, SSIS, Informatica, Airflow, and similar) to identify and design iceDQ rules — Validation, Duplicate, Checksum, Recon, Pushdown. Use whenever the user SHARES pipeline code and wants checks derived from it, e.g. "generate iceDQ rules from this stored procedure", "here is my dbt model, derive the checks". The code must actually be provided — naming an ETL tool without sharing code is an advice request (icedq-suggest-checks). Analyzes the code and designs the checks, then emits approved rule specs (references/rule-spec.md) to icedq-author-rules Build mode, which performs the creation. NOT for: authoring without code (icedq-author-rules), mapping documents (icedq-mapping-doc-rules), migration/reconciliation planning (icedq-compare-datasets, which may invoke this skill), running or scheduling existing rules.
server_compat: ">=2.0.0"
---

## GOAL

Extract ALL quality rules from ETL code (SQL SP, dbt, PySpark, Spark Scala, SSIS, Informatica, Airflow, Databricks). ONE
Validation rule per table. Rule types: Validation, Duplicate, Checksum, Recon, Pushdown.

**Output contract:** this skill designs and gets approval; it does NOT call `create_*` tools. The
approved Rule Plan is converted into **rule specs** (`references/rule-spec.md`) and handed to
**`icedq-author-rules` Build mode**, which validates, creates, and confirms each rule. Every
decision approved here travels in the spec — Build mode never re-asks (populated field = approved).

---

## STEP 0 — TRIAGE

| Tier       | Criteria                                     | Action                                                                    |
|------------|----------------------------------------------|---------------------------------------------------------------------------|
| 1 Simple   | 1 src→1 tgt, ≤10 transforms                  | Proceed to Step 1                                                         |
| 2 Moderate | 1-2 src→1-2 tgt, 10-30 transforms            | Separate Source Validation per table; identify lookup vs enrichment joins |
| 3 Complex  | Multi-hop or 30+ transforms                  | Map full lineage; instrument one layer boundary at a time                 |
| 4 Critical | CDC, SCD Type 2, incremental, cross-platform | Apply Step 4 patterns; confirm scope with user before any tool call       |

Tier 3/4: show lineage (src→staging→dw_fact) and ask which layer(s) to instrument first.

---

## STEP 1 — RESOLVE & VERIFY

**Connection type detection — do this first:**
- `list_connections(workspaceId)` → for each connection check `connectorType`
- File connections (flat-file, parquet, excel, json, xml, flat-file-sql) → use FILE FLOW below
- Database connections (rdbms) → continue with the standard DB steps

**DB connections:**
1. `get_database_metadata(workspaceId, connectionId)` → check `supportedHierarchy` field.
   - If `"database"` is in `supportedHierarchy` → call `list_connection_metadata(entity="database")` first to list catalogs/databases.
   - Otherwise → skip directly to `list_connection_metadata(entity="schema")`.
2. `list_connection_metadata(entity="schema")` → confirm schema exists. Missing → flag, stop.
3. `list_connection_metadata(entity="table")` → confirm all tables exist. Missing → flag, stop.
4. `list_connection_metadata(entity="column")` for EVERY referenced table → get live columns + icedqDatatypes.
5. ONLY use live columns. Never invent or copy from ETL code without verification.

**Databricks / Unity Catalog special handling:**
- Databricks uses 3-part naming: `catalog.schema.table` (e.g., `icedqcatalog.default.my_table`).
- The ETL script's catalog/schema may NOT exist in the connected environment (e.g., ETL says `main.dbo` but `dbo` schema doesn't exist under `main`).
- When ETL tables are not found in the script-specified catalog → scan the available catalogs returned by `entity="database"` to locate the closest matching tables. Common Databricks locations: `icedqcatalog.default`, `hive_metastore.default`, `hive_metastore.demo_db`.
- Pass `databaseName` as the Unity Catalog name (e.g., `"icedqcatalog"`) in all subsequent calls.
- NEVER assume ETL catalog/schema/table names are live — always confirm via `list_connection_metadata` before building any rule.

**File connections:**
1. `list_files(workspaceId, connectionId)` → confirm the target file exists.
2. `fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId, ruleType, connectionType, fileName)` → registers the file schema and creates a draft rule. Returns ruleId + columns + sample data.
3. **DELIMITER CHECK (flat-file only):** Inspect the returned `columns` array immediately.
   - If only 1 column is returned, or column names contain separator characters, the delimiter is wrong.
   - Read the raw `data` rows to detect the real delimiter (`,` · `|` · `\t` · `;`).
   - Re-call: `fetch_file_sample_data(..., additionalConfigs={ columnDelimiter: "<correct>" })` before proceeding.
4. Inspect returned columns and sample data — use these for check design.
5. The draft rule is completed later by Build mode via `update_rule` — carry the returned ruleId in the spec as `existingDraftRuleId`.

**Connection/Table Not Found — escalation rule (Essential):**
- If the ETL script references a schema, table, or database that cannot be found after listing connections: **STOP. Do NOT substitute with nearest-match tables.**
- Ask the user: *"The table `<name>` from your script was not found. Which connection does it live in?"*
- If unsure whether all connections were checked: **paginate through ALL pages** of `list_connections` (loop `pageNo` from 1 to `pages`) before concluding a connection is absent. With large workspaces (100+ connections), use `pageSize: 50` to reduce round-trips.

**Gate:** ALL connections, schemas/files, tables/columns confirmed before proceeding.

---

## STEP 2 — LANGUAGE SIGNAL PATTERNS

**SQL (T-SQL/PL-SQL/Snowflake/BigQuery/Spark SQL):**  
| Pattern | Signal → Rule |
|---|---|
| WHERE col IN (...) | ValidValues on source |
| WHERE col NOT IN (...) | Custom exclusion on source |
| WHERE col IS NOT NULL | NotNull on source |
| WHERE col >= x AND col <= y | Custom range on source |
| WHERE col LIKE 'x%' | Custom regex on source |
| CONVERT/CAST+format | Date format on source |
| LTRIM/RTRIM/TRIM | Non-empty Custom on source |
| COALESCE/ISNULL(col,default) | col CAN be null — no NotNull |
| CASE col WHEN 'x' THEN 'label' | ValidValues on target (decoded labels) |
| CASE WHEN range THEN 'band' | ValidValues on target (band labels) |
| col1+' '+col2 / CONCAT | NotNull+non-empty Custom on target |
| col/divisor | Unit conversion → Custom range(>=0) on target |
| UPPER/LOWER | ValidValues normalized-case expected values |
| HASH/MD5 | Skip |
| IDENTITY/AUTOINCREMENT | Skip |
| CONSTRAINT UNIQUE / UQ_* | Duplicate on target |
| PRIMARY KEY on natural key | Duplicate on source |
| ROW_NUMBER() OVER (PARTITION BY key) | Duplicate on source (PARTITION BY cols) |
| COUNT(*) UNION ALL COUNT(*) | Checksum COUNT |
| SUM(x)/factor UNION ALL SUM(y) | Checksum SUM |
| JOIN src ON src.key=tgt.key | Recon |
| LEFT JOIN … WHERE tgt.col IS NULL | Orphan → Pushdown |
| MERGE INTO … WHEN MATCHED | Upsert/SCD → Step 4A |
| INSERT … WHERE NOT EXISTS | Incremental → Step 4B |

**Python/PySpark:**
| Pattern | Signal → Rule |
|---|---|
| df.filter(col("x").isin([...])) | ValidValues on source |
| df.filter(col("x").isNotNull()) / dropna | NotNull on source |
| df.filter(col("x")>=val) | Range on source |
| df.fillna({"col":default}) | col CAN be null — no NotNull |
| df.withColumn("x", f.to_date(col,fmt)) | Date check (use fmt as dateFormat) |
| df.dropDuplicates(["key"]) | Duplicate on source |
| df.agg(f.count/f.sum) | Checksum COUNT/SUM |
| df.join(other, on="key", how="left") | Orphan → Pushdown |
| regexp_replace/regexp_extract | Custom format check |

**dbt:** not_null→NotNull · unique→Duplicate · accepted_values→ValidValues · relationships→Pushdown · source
freshness→Pushdown · expression_is_true→Custom · incremental_strategy='merge'→Step 4A

**Spark Scala:** same signals as PySpark.

**SSIS/Informatica:**
| Component | Signal → Rule |
|---|---|
| Lookup Transformation | Pushdown referential integrity |
| Conditional Split | ValidValues or range on source |
| Derived Column | Unit conversion or concat check |
| Data Conversion | Type/format check |
| Sort+Remove Duplicates | Duplicate on source |
| Multicast (1→N) | One Target Validation per output |
| Union All (N→1) | One Source Validation per input |
| SCD | Step 4A |

---

## STEP 3 — SIGNAL EXTRACTION MATRIX

**Before any expression:** `get_guidance('groovy_expressions')` — never write Groovy from memory.
**Before any column name:** verify via `list_connection_metadata(entity="column")` — never copy from ETL code.
**Before arithmetic:** check icedqDatatype for every column. TEXT → cast first. See ANTI-PATTERNS.

**SOURCE Validation — combine ALL into ONE rule per source table:**
| ETL Pattern | Check | Expression/Params |
|---|---|---|
| WHERE col IN ('A','B') | ValidValues | expectedValues:['A','B'] |
| WHERE col IS NOT NULL | NotNull | — |
| WHERE col>=x AND col<=y | Custom | S.[col]>=x && S.[col]<=y |
| WHERE col NOT IN ('X','Y') | Custom | !(S.[col] in ['X','Y']) |
| CONVERT/to_date(col,fmt) — DATE/TIMESTAMP col | Date | dateFormat: see table below |
| String-stored date (TEXT col, any format) | Custom | regex guard + try/catch parse; see date table |
| LTRIM/RTRIM/TRIM | Custom | S.[col]!=null && S.[col].trim()!="" |
| LIKE 'prefix%' | Custom | S.[col]==~/^prefix.*$/ |
| WHERE col>0 / col>=0 | Custom | S.[col]>0 or S.[col]>=0 |
| COALESCE/ISNULL with default | (none) | col CAN be null — skip |
| dropDuplicates/ROW_NUMBER=1 | (none) | → Duplicate rule |

**Date format map — SQL Server CONVERT:** 101=MM/dd/yyyy · 103=dd/MM/yyyy · 112=yyyyMMdd · 120=yyyy-MM-dd HH:mm:ss ·
126=yyyy-MM-ddTHH:mm:ss. Python/Spark: use fmt arg from to_date() verbatim.

**Date check decision by icedqDatatype:**
| icedqDatatype | Format | Check | Expression |
|---|---|---|---|
| DATE/TIMESTAMP | yyyy-MM-dd | Date | dateFormat=yyyy-MM-dd |
| DATE/TIMESTAMP | yyyy-MM-dd HH:mm:ss | Date | dateFormat=yyyy-MM-dd HH:mm:ss |
| DATE/TIMESTAMP | format validate | Custom | S.[col]!=null && new java.text.SimpleDateFormat("fmt").format(S.[col])==~
/regex/ |
| TEXT | dd/MM/yyyy | Custom | S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4}$/ |
| TEXT | dd/MM/yyyy HH:mm:ss | Custom | S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/ |
| TEXT | yyyyMMdd | Custom | S.[col]!=null && S.[col]==~/^\d{8}$/ |
| TEXT | yyyy-MM-dd (string) | Custom | S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}$/ |
| TEXT | yyyy-MM-ddTHH:mm:ss | Custom | S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/ |
| TEXT | parse validity | Custom | S.[col]!=null && { try{new java.text.SimpleDateFormat("fmt").parse(S.[col])
;true}catch(e){false} } |

**Date ordering:**

- DATE/TIMESTAMP cols: `S.[start]!=null && S.[end]!=null && !S.[end].before(S.[start])`
- TEXT cols: parse both before comparing — NEVER use >= / <= on TEXT date strings (lexicographic ≠ chronological for
  dd/MM/yyyy):
  `new java.text.SimpleDateFormat("dd/MM/yyyy").parse(S.[start]).before(new java.text.SimpleDateFormat("dd/MM/yyyy").parse(S.[end]))`

**TARGET Validation — combine ALL into ONE rule per target table:**
| ETL Pattern | Check | Expression |
|---|---|---|
| CASE col WHEN 'A' THEN 'Active' | ValidValues | decoded label list |
| CASE WHEN range THEN 'band' | ValidValues | band label list |
| col1+' '+col2 concat | Custom | S.[col]!=null && S.[col].trim()!="" |
| col/divisor | Custom | S.[col].compareTo(java.math.BigDecimal.ZERO)>=0 [Snowflake] or S.[col]>=0 [SS] |
| UPPER/LOWER normalization | ValidValues | normalized-case expected values |
| NOT NULL in DDL | NotNull | — |
| CHECK constraint in DDL | Custom | translate to Groovy |
| COALESCE(col,'Unknown') | ValidValues | include 'Unknown' in list |
| IDENTITY/AUTOINCREMENT | (none) | skip |
| HASH/MD5 | (none) | skip |
| UNIQUE CONSTRAINT in DDL | (none) | → Duplicate rule |

**Duplicate:**
| Signal | Table | Columns |
|---|---|---|
| CONSTRAINT UQ_xxx UNIQUE(col) | target | [col] |
| PRIMARY KEY on natural key | source | [pk_col] |
| dropDuplicates(["key"]) | source | [key] |
| ROW_NUMBER() PARTITION BY(key)=1 | source | [PARTITION BY cols] |
| MERGE…ON src.key=tgt.key | target | [ON cols] |

**Checksum:**
| Pattern | Mode | Source SQL | Target SQL | Expression |
|---|---|---|---|---|
| COUNT vs COUNT | Table | auto | auto | S.[SRC_CNT]-T.[TGT_CNT]==0 |
| SUM(col)/factor vs SUM(col) | SQL | SELECT SUM(col)/factor AS SRC FROM src | SELECT SUM(col) AS TGT FROM tgt |
Math.abs(S.[SRC]-T.[TGT])<=tol |
| AVG vs AVG | SQL | SELECT AVG(col) AS SRC FROM src | SELECT AVG(col) AS TGT FROM tgt | Math.abs(S.[SRC]-T.[TGT])<
=tol |
| Batch/incremental | SQL | add WHERE batch_date=@date | add WHERE loaded_date=@date | S.[SRC_CNT]-T.[TGT_CNT]==0 |

Apply same unit-conversion factor on source side. SQL mode: cast at row level before aggregating —
`SUM(CAST(col AS DECIMAL(p,s))/factor)`, not `CAST(SUM(col) AS DECIMAL)/factor`. Wrap in COALESCE(…,0) for empty-table
protection.
SQL mode — **validate before Rule Plan:** `fetch_db_sample_data` on each SQL → must return 1 row, 1 non-NULL numeric col,
no error.

For file connections in Checksum: use `fetch_file_sample_data(ruleType="Checksum")`; Build mode
handles the file-vs-DB creation workflow from the spec.

**Recon:** Call `analyze_recon_mapping` before designing any Recon spec. Accept HIGH confidence; ask user on MEDIUM; skip
LOW.

> ⚠️ **`analyze_recon_mapping` call signature:** Pass `sourceColumns` and `targetColumns` as explicit arrays of column
> objects (from `list_connection_metadata(entity="column")`). The tool does NOT accept connection IDs — you must collect
> the column arrays first and pass them directly.

> ℹ️ **`create_recon_rule` supports TWO check types:**
> 1. **SimpleCompare** — provide `sourceColumn` + `targetColumn` only (no `expression` field). Automatically applies
>    case-insensitive comparison, trimming, whiteSpaceAsNull, emptyStringAsNull.
> 2. **Custom (Groovy)** — provide an `expression` string for complex transforms or value-mapping checks
>    (e.g., date format conversion, math tolerance, vocab mapping). TRUE = row passes, FALSE = row fails.
>
> For value-mapping transforms where source and target hold DIFFERENT vocabulary (e.g., source=`"Active"`,
> target=`"ACT"`), write a custom Groovy expression. Only fall back to a **Pushdown rule** when the comparison
> requires a JOIN across datasets (see Pushdown section and Step 4 pattern below).

| Transform | Recon action | Groovy (TRUE=PASS) |
|---|---|---|
| Direct passthrough | SimpleCompare (auto trim + case-insensitive) | auto-generated |
| CASE decode (same vocab, different case) | SimpleCompare | auto-generated (case-insensitive handles it) |
| CASE decode (different vocab: code→label or abbrev→full) | **SKIP from Recon → add Pushdown** | see Pushdown pattern |
| col/divisor | custom math | Math.abs((S.[col]/100.0)-T.[col])<0.01 |
| Date: src TEXT dd/MM/yyyy → tgt TEXT yyyy-MM-dd | custom date | S.[col]!=null&&T.[col]!=null&&new Date().parse("
dd/MM/yyyy",S.[col]).format("yyyy-MM-dd")==T.[col].toString().substring(0,10) |
| Date: src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (mandatory) | custom date | S.[col]!=null&&T.[col]!=null&&S.[col]
.substring(0,10)==T.[col].toString().substring(0,10) |
| Date: src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (nullable) | custom date | S.[col]==null?T.[col]==null:T.[col]!
=null&&S.[col].substring(0,10)==T.[col].toString().substring(0,10) |
| Date: src DATE → tgt TEXT dd/MM/yyyy | custom date | S.[col]!=null&&T.[col]!=null&&S.[col].format("dd/MM/yyyy")
==T.[col] |
| Date: src DATE → tgt TEXT yyyy-MM-dd | custom date | S.[col]!=null&&T.[col]!=null&&S.[col].toString().substring(0,10)
==T.[col] |
| Date: src TEXT dd/MM/yyyy → tgt DATE | custom date | S.[col]!=null&&T.[col]!=null&&new Date().parse("dd/MM/yyyy"
,S.[col]).format("yyyy-MM-dd")==T.[col].toString().substring(0,10) |
| Date: src TEXT dd/MM/yyyy HH:mm:ss → tgt DATE | custom date | S.[col]!=null&&T.[col]!=null&&new Date().parse("
dd/MM/yyyy HH:mm:ss",S.[col]).format("yyyy-MM-dd")==T.[col].toString().substring(0,10) |
| Date: src TEXT → tgt DATE, unknown format | custom date (instanceof) | if(!(S.[col] instanceof Date)){def d=new Date()
.parse("yyyy-MM-dd",S.[col]);d.format("yyyy-MM-dd")==T.[col].toString().substring(0,10)}else{S.[col].format("
yyyy-MM-dd")==T.[col].toString().substring(0,10)} |
| Concatenation (2+ cols) | SKIP | too complex |
| Lookup/dim decode | SKIP or Custom | ask user |
| ETL timestamp/GETDATE | SKIP | audit only |
| IDENTITY/surrogate | SKIP | system-generated |
| HASH/MD5 | SKIP | — |

**Pushdown:** last resort; only when no other rule type fits.
| Pattern | Reason |
|---|---|
| LEFT JOIN…WHERE tgt.col IS NULL | cross-table orphan |
| GROUP BY…HAVING COUNT(*)>N | aggregate condition |
| FK not DB-enforced | referential integrity |
| SCD Type 2 open-record uniqueness | window function required |
| Reject table row count=0 | threshold on reject table |
| CASE decode where src vocab ≠ tgt vocab (e.g., `"Active"` vs `"ACT"`) | value-mapping validation across tables — Recon SimpleCompare cannot handle this |

**Value-mapping Pushdown pattern (CASE decode across src→tgt):**
```sql
SELECT src.key_col, src.status_col AS src_status, tgt.status_col AS tgt_status
FROM src_table src
JOIN tgt_table tgt ON src.key_col = tgt.key_col
WHERE NOT (
    (src.status_col = 'Active'   AND tgt.status_col = 'ACT')
 OR (src.status_col = 'Inactive' AND tgt.status_col = 'INA')
 OR (src.status_col = 'Closed'   AND tgt.status_col = 'CLO')
)
-- 0 rows = all mappings correct = PASS
```

SQL returns ONLY failing rows (0 rows=pass). Validate SQL via `fetch_db_sample_data` before Rule Plan.

---

## STEP 4 — SPECIALIZED PATTERNS

**4A SCD Type 2:** Source Validation (business key + changed cols) · Duplicate on source (business key) · Pushdown
open-record uniqueness: `SELECT bk,COUNT(*) FROM dim WHERE expiry_date IS NULL GROUP BY bk HAVING COUNT(*)>1` · Pushdown
date continuity · Checksum: `T.[TGT_CNT]>=S.[SRC_CNT]`

**4B Incremental/CDC:** Source Validation: NotNull/ValidValues on cdc_action · Checksum batch-filtered:
`WHERE batch_date=@batch` both sides · Recon SQL mode with batch filter · Pushdown duplicate inserts:
`SELECT key,COUNT(*) FROM tgt WHERE loaded_date=@batch GROUP BY key HAVING COUNT(*)>1`

**4C Fan-In (UNION ALL):** One Source Validation per source · One Target Validation · One Checksum per source
contribution (`WHERE source_system='X'` in target SQL) · Recon only if shared join key exists

**4D Multi-Hop (src→staging→DW→mart):** At each boundary: Validation on input + Checksum(count+aggregates) + Recon if
join key. Ask user which boundary first.

**4E Lookup/Dimension Joins:** No Recon. Pushdown:
`SELECT f.dim_key FROM fact f LEFT JOIN dim d ON f.dim_key=d.id WHERE d.id IS NULL`

**4F Reject/Error Tables:** Pushdown: `SELECT COUNT(*) FROM reject_table WHERE batch_id=@batch` — 0 rows=pass. If ETL
filters intentionally: Checksum(source_count - target_count = expected_exclusion).

---

## STEP 5 — PRE-PLAN TOOL CALLS (ALL required before Rule Plan)

Analysis tooling runs here; **creation guidance (`get_guidance('create_*_rules')`) is Build mode's
job** — do not pull it in this skill.

**5a Validation:**
- DB: `fetch_db_sample_data` + `profile_data` + `suggest_quality_checks` (src + tgt) · `get_guidance('groovy_expressions')` before writing any Custom expression
- File: sample data already from `fetch_file_sample_data` in Step 1 (note the returned draft ruleId — it goes into the spec as `existingDraftRuleId`) · `profile_data` on returned rows

**5b Duplicate:** `profile_data` on key cols (distinct=total check)

**5c Checksum:**
- DB: reuse profile row counts · SQL mode: `fetch_db_sample_data` on each SQL (1 row, 1 non-NULL numeric, no error)
- File: `fetch_file_sample_data(ruleType="Checksum")` already done in Step 1

**5d Recon:** `analyze_recon_mapping`. Use results: confirm join key alignment; identify decode/date/type-cast cols needing custom expressions; flag SKIP cols.
- **Required:** collect `sourceColumns` + `targetColumns` arrays via `list_connection_metadata(entity="column")` for each table BEFORE calling `analyze_recon_mapping`. The tool takes column arrays, not connection IDs.
- After mapping analysis: columns with different vocabulary (e.g., source=`"Active"`, target=`"ACT"`) → remove from Recon check list → plan a Pushdown rule for them instead.
- Cross-platform source/target → decide `sortMode` now (see `references/cross-platform-recon.md`); it is create-time-only and must be in the spec.

**5e Pushdown:**
- DB: `fetch_db_sample_data` on child+parent tables; validate SQL
- File: sample data from `fetch_file_sample_data`

**5f Existing rules (reuse before create):** `list_rules(workspaceId, nameFilter=<table name>)` →
for plausible matches, `get_rule` to confirm what they check → classify **reuse as-is / extend
(`update_rule`) / create new** per planned check. Drop anything already covered from the Rule Plan.

**Checklist:**

- [ ] Connections · schemas/files · tables/columns all confirmed
- [ ] DB: fetch_db_sample_data + profile_data + suggest_quality_checks (src + tgt) | File: fetch_file_sample_data returns columns + data
- [ ] analyze_recon_mapping (if join key) · sortMode decided for cross-platform recons
- [ ] Checksum/Pushdown SQL validated (DB: via fetch_db_sample_data; File: via fetch_file_sample_data)
- [ ] get_guidance('groovy_expressions') pulled before any Custom expression was written
- [ ] list_rules checked for existing coverage · reuse/extend/create-new decided per check

---

## STEP 6 — RULE PLAN (present; wait for approval before creating)

> ⛔ **Essential — Always present the full Rule Plan to the user and explicitly ask for approval before handing anything to Build mode.**
> The message must clearly communicate: what table/file will be used, what rule type, what checks will be created, and what the rule will be named.
> Do NOT hand any rule spec to `icedq-author-rules` Build mode until the user explicitly approves the plan.

Per `conventions.md` §8: the callout above must also state what each check tests and the risk it
protects against, in plain language, before the rule-type detail below — not just table/rule-type/
name.

```
CONNECTION TYPE: DB | File | Mixed
LINEAGE (Tier 2+): [src]→[staging]→[tgt]  connections: …
SOURCE VALIDATION: {SrcTable}_Source_Checks | conn | schema.table (DB) or fileName (File)
  col · checkType · params [ETL signal/profiling/suggested]
TARGET VALIDATION: {TgtTable}_Target_Checks | conn | schema.table
  col · checkType · params
DUPLICATE: {Table}_{Cols}_Duplicate_Check | columns:[…] | signal: UNIQUE/PK/dedup
CHECKSUM: {Src}_vs_{Tgt}_RowCount_Checksum | Table mode (DB) or fetch_file_sample_data flow (File)
          {Src}_vs_{Tgt}_{Col}_Sum_Checksum | SQL mode | src SQL … | tgt SQL … | expr …
RECON:    {Src}_vs_{Tgt}_Recon | join: src.col=tgt.col
  src.col→tgt.col [direct/decoded/converted/SKIP]
PUSHDOWN: {Table}_{Purpose}_Pushdown | SQL (0 rows=pass)
TOTAL: X rules / Y types
```

---

## STEP 7 — SPEC HANDOFF (Build mode creates)

Convert each approved Rule Plan line into a complete **rule spec** per `references/rule-spec.md`:
resolved IDs (workspace, connection, folder), datasets (table or SQL — Checksum/Pushdown SQL
already validated in Step 5), checks with expressions, join keys, result types, `sortMode` for
cross-platform recons, criticality — and `producedBy: icedq-etl-code-rules`. Anything the customer
has not decided goes in `openQuestions`, not guessed. File datasets carry `existingDraftRuleId`
from Step 1 registration.

Spec-content rules carried from the analysis:
- Recon specs: only include columns where source and target hold the **same vocabulary** (direct
  passthrough, or case/whitespace differences — SimpleCompare handles those). Different vocabulary
  (code→full-word, abbrev→long-form) → **omit from the Recon spec** and cover with a Pushdown spec
  (value-mapping pattern in Step 3).
- Pushdown specs: CRITICAL severity first.

Hand the batch to **`icedq-author-rules` Build mode** in this order (it validates each spec,
creates, and returns the ruleId — confirm each before proceeding):

1. Source Validation spec(s) — one per source table
2. Target/staging Validation spec(s)
3. Duplicate spec(s)
4. Checksum spec(s)
5. Recon spec(s)
6. Pushdown spec(s)

If Build mode flags a spec back (e.g. mis-typed rule, missing create-time setting), resolve it with
the customer here — the design decision belongs to this skill — and re-hand the corrected spec.

---

## STEP 8 — POST-CREATION

Offer: (1) group into workflow (2) schedule after ETL load (3) move to folder.

---

## ANTI-PATTERNS

**Rule design:** ONE Validation rule per table. No Pushdown when Validation/Checksum/Recon fits. No Recon for
lookup/enrichment joins. No Recon without join key. Never validate IDENTITY/AUTOINCREMENT/GETDATE/HASH. No NotNull on
COALESCE/ISNULL cols. Checksum always compares two sides.

**Columns:** Only from `list_connection_metadata(entity="column")`. Never copy from ETL code without verification. Never propose Rule Plan until all schemas/tables/columns confirmed. For file connections, only use columns returned by `fetch_file_sample_data`.

**Process:** This skill calls NO `create_*` or `update_rule` tools — creation belongs to
`icedq-author-rules` Build mode via rule specs. Complete Step 5 before the Rule Plan. Present the
full plan and get explicit approval before handing any spec to Build mode. Tier 3/4: one layer
boundary at a time.

**File connections:** file schemas are registered with `fetch_file_sample_data` during Step 1 (this
creates a draft rule — carry its ruleId in the spec as `existingDraftRuleId`; Build mode completes
it via `update_rule`).

**SQL queries:** Validate Checksum/Pushdown SQL via `fetch_db_sample_data` in Step 5, before the Rule Plan — not at
creation time. NULL result or query failure → engine exit code -4 at runtime. Cast at row level before aggregating;
COALESCE aggregates against empty-table NULL.

**Expression & platform recipes:** ALL canonical Groovy expressions (dates, BigDecimal, type
conversion), S.[col]/T.[col] context rules, Recon expression anti-patterns, and tool-argument
gotchas live in [references/groovy-recipes.md](references/groovy-recipes.md). Read the relevant
section before writing ANY expression into a rule spec — these encode confirmed production
failures.
