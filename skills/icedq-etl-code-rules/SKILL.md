---
name: icedq-etl-code-rules
description: Creates ETL rules in iceDQ. Use when the user asks to create ETL rules, data pipeline rules, or source-to-target validation rules.
---

## GOAL

Extract ALL quality rules from ETL code (SQL SP, dbt, PySpark, Spark Scala, SSIS, Informatica, Airflow, Databricks). ONE
Validation rule per table. Rule types: Validation, Duplicate, Checksum, Recon, Pushdown.

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

1. `list_connections` → map ETL connection names to connectionIds. Unresolved → flag, stop.
2. `list_schemas` → confirm schema exists. Missing → flag, stop.
3. `list_tables` → confirm all tables exist. Missing → flag, stop.
4. `list_columns` for EVERY referenced table → get live columns + icedqDatatypes.
5. ONLY use live columns. Never invent or copy from ETL code without verification.

**Gate:** ALL connections, schemas, tables, columns confirmed before proceeding.

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
**Before any column name:** verify via `list_columns` — never copy from ETL code.
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
SQL mode — **validate before Rule Plan:** `fetch_sample_data` on each SQL → must return 1 row, 1 non-NULL numeric col,
no error.

**Recon:** Call `analyze_recon_mapping` before `create_recon_rule`. Accept HIGH confidence; ask user on MEDIUM; skip
LOW.
| Transform | Recon action | Groovy (TRUE=PASS) |
|---|---|---|
| Direct passthrough | simple equality | auto-generated |
| CASE decode | custom value map | (S.[CD]=="A"&&T.[Col]=="Active")\|\|(S.[CD]=="I"&&T.[Col]=="Inactive")\|\|… |
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

SQL returns ONLY failing rows (0 rows=pass). Validate SQL via `fetch_sample_data` before Rule Plan.

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

**5a Validation:** `fetch_sample_data` + `profile_data` + `suggest_quality_checks` (src + tgt) ·
`get_guidance('groovy_expressions')` · `get_guidance('validation_rule')`

**5b Duplicate:** `profile_data` on key cols (distinct=total check) · `get_guidance('duplicate_rule')`

**5c Checksum:** reuse profile row counts · SQL mode: `fetch_sample_data` on each SQL (1 row, 1 non-NULL numeric, no
error) · `get_guidance('checksum_rule')`

**5d Recon:** `analyze_recon_mapping` · `get_guidance('recon_rule')`. Use results: confirm join key alignment; identify
decode/date/type-cast cols needing custom expressions; flag SKIP cols.

**5e Pushdown:** `fetch_sample_data` on child+parent tables; validate SQL · `get_guidance('pushdown_rule')`

**Checklist:**

- [ ] Connections · schemas · tables · columns all confirmed
- [ ] fetch_sample_data + profile_data + suggest_quality_checks (src + tgt)
- [ ] analyze_recon_mapping (if join key)
- [ ] Checksum/Pushdown SQL validated via fetch_sample_data
- [ ] get_guidance('groovy_expressions') + get_guidance(rule_type) for each planned type

---

## STEP 6 — RULE PLAN (present; wait for approval before creating)

```
LINEAGE (Tier 2+): [src]→[staging]→[tgt]  connections: …
SOURCE VALIDATION: {SrcTable}_Source_Checks | conn | schema.table
  col · checkType · params [ETL signal/profiling/suggested]
TARGET VALIDATION: {TgtTable}_Target_Checks | conn | schema.table
  col · checkType · params
DUPLICATE: {Table}_{Cols}_Duplicate_Check | columns:[…] | signal: UNIQUE/PK/dedup
CHECKSUM: {Src}_vs_{Tgt}_RowCount_Checksum | Table mode
          {Src}_vs_{Tgt}_{Col}_Sum_Checksum | SQL mode | src SQL … | tgt SQL … | expr …
RECON:    {Src}_vs_{Tgt}_Recon | join: src.col=tgt.col
  src.col→tgt.col [direct/decoded/converted/SKIP]
PUSHDOWN: {Table}_{Purpose}_Pushdown | SQL (0 rows=pass)
TOTAL: X rules / Y types
```

---

## STEP 7 — EXECUTION ORDER

1. `create_validation_rule` source (one per source table)
2. `create_validation_rule` target/staging
3. `create_duplicate_rule`
4. `create_checksum_rule` (SQL already validated in 5c — do NOT re-validate)
5. `create_recon_rule`
6. `create_pushdown_rule` (SQL already validated in 5e — do NOT re-validate)

Confirm ruleId after each before proceeding.

---

## STEP 8 — POST-CREATION

Offer: (1) group into workflow (2) schedule after ETL load (3) move to folder.

---

## ANTI-PATTERNS

**Rule design:** ONE Validation rule per table. No Pushdown when Validation/Checksum/Recon fits. No Recon for
lookup/enrichment joins. No Recon without join key. Never validate IDENTITY/AUTOINCREMENT/GETDATE/HASH. No NotNull on
COALESCE/ISNULL cols. Checksum always compares two sides.

**Columns:** Only from `list_columns`. Never copy from ETL code without verification. Never propose Rule Plan until all schemas/tables/columns confirmed.

**Process:** Complete Step 5 before Rule Plan. Present full plan before any create_* call. Call `get_guidance` for each
rule type. Tier 3/4: one layer boundary at a time.

**SQL queries:** Validate Checksum/Pushdown SQL via `fetch_sample_data` in Step 5, before the Rule Plan — not at
creation time. NULL result or query failure → engine exit code -4 at runtime. Cast at row level before aggregating;
COALESCE aggregates against empty-table NULL.

**S.[col] vs T.[col] — CRITICAL:**

- Validation rules → ALWAYS S.[col]. Engine presents all rows as "source" side.
- T.[col] → ONLY in Recon rules (S.[col]=source, T.[col]=target).
- T.[col] in Validation → errorCount=total rows, successCount=0 (confirmed 100% error rate).

**Snowflake NUMERIC/BigDecimal — CRITICAL:**

- Snowflake NUMBER/DECIMAL → Java BigDecimal. Raw operators (!=0, >=0) throw ClassCastException → 100% error rate.
- Use: `S.[col].compareTo(java.math.BigDecimal.ZERO)!=0 / >0 / >=0`
- Tolerance: `(S.[A].subtract(S.[B].multiply(S.[C]))).abs().compareTo(new java.math.BigDecimal("0.01"))<=0`
- SQL Server INT/DOUBLE → direct operators safe. TEXT numeric →
  `S.[col]==~/^-?\d+(\.\d+)?$/ && new BigDecimal(S.[col])>0`
- Confirm via `fetch_sample_data` + `typeof()` before writing arithmetic.

**DATE / TIMESTAMP expressions (canonical — use exactly):**

**iceDQ date parsing — always use `new Date().parse("fmt", value)` (from Groovy_Expressions_Overview.xlsx):**

- `new Date().parse("fmt", S.[col])` is the iceDQ-native form for TEXT→Date conversion.
- `Date.parse('fmt','literal')` works for hardcoded date constants only. NOT for field values.
- `new java.text.SimpleDateFormat().parse()` is not the preferred pattern in iceDQ Groovy — use `new Date().parse()`.

**DATE/TIMESTAMP col (icedqDatatype DATE or TIMESTAMP) — already a Java Date object:**

- Null + future guard: `S.[col]!=null && S.[col]<=new Date()`
- Year compare: `S.[col]!=null && S.[col]>new Date().parse('yyyy','2014')`
- Range:
  `S.[col]!=null && S.[col]>=new Date().parse('yyyy-MM-dd','2020-01-01') && S.[col]<=new Date().parse('yyyy-MM-dd','2024-12-31')`
- Ordering (both DATE cols): `S.[start]!=null && S.[end]!=null && !S.[end].before(S.[start])`
- Strip time: `S.[col]!=null && S.[col].clearTime()`
- Format to string: `S.[col].format("yyyy-MM-dd")`
- Calendar — extract parts:
  `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.get(Calendar.YEAR)` (also MONTH, DAY_OF_MONTH, DAY_OF_WEEK,
  WEEK_OF_YEAR, DAY_OF_YEAR)
- Calendar — add time:
  `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.add(Calendar.MONTH,N); cal.getTime()`
- Date diff in days: `(S.[col1]-S.[col2]).abs()`

**TEXT col (string-stored date) — regex guard first, then new Date().parse():**

- dd/MM/yyyy guard: `S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4}$/`
- dd/MM/yyyy HH:mm:ss guard: `S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/`
- yyyyMMdd guard: `S.[col]!=null && S.[col]==~/^\d{8}$/`
- yyyy-MM-dd guard: `S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}$/`
- yyyy-MM-ddTHH:mm:ss guard: `S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/`
- Parse validity (Validation only — try/catch NOT valid in Recon):
  `S.[col]!=null && { try{new Date().parse("dd/MM/yyyy",S.[col]);true}catch(e){false} }`
- Convert TEXT→Date: `def d = new Date().parse("yyyy-MM-dd", S.[col])`
- Convert TEXT→reformatted string: `new Date().parse("yyyy-MM-dd", S.[col]).format("yyyy-MM-dd")`
- Ordering (NEVER >= on TEXT date strings — lexicographic ≠ chronological):
  `S.[start]!=null && S.[end]!=null && new Date().parse("dd/MM/yyyy",S.[start]).before(new Date().parse("dd/MM/yyyy",S.[end]))`
- Date diff two TEXT cols: `(new Date().parse("yyyy-MM-dd",S.[col1])-new Date().parse("yyyy-MM-dd",S.[col2])).abs()`

**instanceof guard — for columns that may be DATE or TEXT depending on platform:**

-
`if(!(S.[col] instanceof Date)) { def d=new Date().parse("yyyy-MM-dd",S.[col]); d.equals(T.[col]) } else { S.[col].equals(T.[col]) }`

**Recon cross-format — target DATE always use .toString().substring(0,10) or .format():**

- src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (mandatory):
  `S.[col]!=null&&T.[col]!=null&&S.[col].substring(0,10)==T.[col].toString().substring(0,10)`
- src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (nullable):
  `S.[col]==null?T.[col]==null:T.[col]!=null&&S.[col].substring(0,10)==T.[col].toString().substring(0,10)`
- src TEXT dd/MM/yyyy → tgt DATE:
  `S.[col]!=null&&T.[col]!=null&&new Date().parse("dd/MM/yyyy",S.[col]).format("yyyy-MM-dd")==T.[col].toString().substring(0,10)`
- src DATE → tgt TEXT yyyy-MM-dd: `S.[col]!=null&&T.[col]!=null&&S.[col].format("yyyy-MM-dd")==T.[col]`
- src DATE → tgt TEXT dd/MM/yyyy: `S.[col]!=null&&T.[col]!=null&&S.[col].format("dd/MM/yyyy")==T.[col]`

**Decision tree — always check icedqDatatype first:**

1. DATE/TIMESTAMP → Java Date → use `.before()`, `.after()`, `.clearTime()`, `.format()`, Calendar API
2. TEXT → string → regex guard, then `new Date().parse("fmt", S.[col])` to convert
3. Unknown/mixed → `instanceof Date` guard
   Call `fetch_sample_data` to confirm actual runtime type before writing any date expression.

**Type conversion (TEXT columns holding numeric values):**

- Preferred (reliable): `Integer.parseInt(S.[col])`, `Double.parseDouble(S.[col])`, `Float.parseFloat(S.[col])`
- Alternative (may not always work): `S.[col].toInteger()`, `S.[col].toDouble()`, `S.[col].toFloat()`
- Number→String: `S.[col].toString()`
- Null-safe cast: `S.[col]!=null && Integer.parseInt(S.[col])>=0`

**Recon date ANTI-PATTERNS — CRITICAL (confirmed production failures):**

- `SimpleDateFormat.format(T.[col])` on DATE icedqDatatype → throws. Use `T.[col].toString().substring(0,10)` or
  `T.[col].format("yyyy-MM-dd")`.
- `T.containsKey('col')` → NOT SUPPORTED. Orphan rows have T.[col]=null. Use `T.[col]==null` guard.
- `try/catch` in Recon expressions → NOT SUPPORTED. Only valid in Validation Custom checks.
- `Date.parse('fmt', S.[col])` with field variable → unreliable. Use `new Date().parse("fmt", S.[col])`.
- `>= / <=` on TEXT date strings → wrong. Always parse first with `new Date().parse()`.