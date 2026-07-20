---
name: mapping-doc-rule-creation
description: Creates iceDQ rules from a mapping document. Use when the user uploads or mentions a mapping doc, ETL mapping sheet, or source-to-target mapping.
server_compat: ">=2.0.0"
---

## GOAL

Extract ALL quality rules from a column mapping spec. ONE Validation rule per table (all checks combined). Rule types:
Validation, Duplicate, Checksum, Recon, Pushdown.

---

## STEP 0 — PARSE DOC

**Format detection:**

- Excel/CSV/Word table: find header row; map labels to signal fields below. Ignore decorative title rows.
- dbt schema.yml: not_null→Mandatory; unique→UniqueKey; accepted_values→ApprovedValues; relationships→FK Pushdown
- JSON Schema: required→Mandatory; enum→ApprovedValues; maxLength→MaxLen; pattern→Format; $ref→FK Pushdown
- Prose: scan for "Validations:", "Business Rules:", "Constraints:", "Data Requirements:" headings

**Signal field aliases:**
| Signal | Common column names |
|---|---|
| Source col | Source Column, SRC Column, From Column, Source Field |
| Target col | Target Column, TGT Column, DW Column, Destination |
| Mandatory | Mandatory?, Required?, Nullable?, Not Null |
| Unique key | Unique Key?, PK?, Business Key?, Natural Key? |
| Transform | Transformation, Logic, Mapping Rule, ETL Logic |
| Approved values | Approved Values, Domain, Valid Values, Lookup |
| Format | Format, Pattern, Regex, Data Format |
| Min/Max Length | Min Length, Max Length, Length |
| FK | Cross-Table, FK Reference, References, Lookup Table |
| Business rule | Business Rule, Acceptance Criteria, DQ Rule, Notes |
| Severity | Severity, Priority, Criticality, Risk Level |

YES synonyms: Y YES TRUE 1 Required NOT NULL Mandatory. NO synonyms: N NO FALSE 0 Optional NULL Nullable blank.

**Missing columns — infer:**

- No Mandatory col → check target DDL for NOT NULL; scan Business Rule text for "must not be null"
- No Unique Key → scan Business Rule for "must be unique"/"primary key"/"no duplicate"
- No Approved Values → extract from Business Rule or Transform text
- No Min/Max Length → infer from type: VARCHAR(N)→max=N; CHAR(N)→exact=N
- No Format → extract regex/format strings from Business Rule text

**Table metadata** (above column rows): source schema.table + connection; target schema.table + connection; join key.
No join key → ask user. If none: Validation + Duplicate + Checksum only (skip Recon).

**Multi-table:**

- Fan-in (N sources→1 target): one Source Validation per source; one Target Validation; one Checksum per source
  contribution
- Fan-out (1 source→N targets): one Target Validation per target; one Checksum per pair; ask user which target first
- Multi-sheet: one Rule Plan per table; instrument one at a time

---

## STEP 1 — RESOLVE & VERIFY

**Connection type detection — do this first:**
- `list_connections(workspaceId)` → for each connection in the mapping doc check `connectorType`
- File connections (flat-file, parquet, excel, json, xml, flat-file-sql) → use FILE FLOW alongside DB steps below
- Database connections (rdbms) → standard DB steps

**DB connections:**
1. `list_connection_metadata(entity="schema")` → confirm schema exists. Missing → flag, stop.
2. `list_connection_metadata(entity="table")` → confirm source + target tables exist. Missing → flag, stop.
3. `list_connection_metadata(entity="column")` for both tables → get live column list + icedqDatatypes.
4. Verify every mapping-doc column exists in live schema. Flag phantoms — never create rules for them.
5. `list_workspaces` + `list_folders` → resolve workspace + folder. Propose creating folder if missing; wait for approval.

**File connections:**
1. `list_files(workspaceId, connectionId)` → confirm the target file exists.
2. `fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId, ruleType, connectionType, fileName)` → registers the file schema and creates a draft rule. Returns ruleId + columns + sample data.
3. **DELIMITER CHECK (flat-file only):** Inspect the returned `columns` array immediately.
   - If only 1 column is returned, or column names visibly contain separator characters, the delimiter is wrong.
   - Read the raw `data` rows to detect the real delimiter (`,` · `|` · `\t` · `;`).
   - Re-call: `fetch_file_sample_data(..., additionalConfigs={ columnDelimiter: "<correct>" })` before proceeding.
4. Cross-reference returned columns with mapping doc columns. Flag any phantom columns.
5. Use returned sample data rows for profiling and check design — do not assume column types from the mapping doc alone (flat-file always reports "Text" by default; infer actual type from values).

**Gate:** ALL connections, schemas/files, tables/columns confirmed before proceeding.

---

## STEP 2 — SIGNAL EXTRACTION

**Mandatory field:**

- YES → NotNull on source AND target
- YES + Transform "Default to X if null" → target NotNull only (source CAN be null)
- NO → no NotNull

**Unique Key field:**

- YES single col → Duplicate on source AND target
- YES composite (A+B) → multi-col Duplicate on target; Recon join key = [A, B]

**Data type changes → signals:**
| Source → Target | Check |
|---|---|
| DATETIME/TIMESTAMP → DATE | Date(yyyy-MM-dd) on target; Recon custom date compare |
| TEXT(dd/MM/yyyy) → DATE | Source: regex guard + try/catch parse; Recon: SimpleDateFormat parse+format compare |
| TIMESTAMP → TIMESTAMP_NTZ | Date(yyyy-MM-dd HH:mm:ss) on target |
| VARCHAR(N) → VARCHAR(M) M<N | Length=M on target |
| CHAR(N) → CHAR/VARCHAR(N) | Length=N on target |
| NOT NULL in source type | Source NotNull |
| NOT NULL in target type only | Target NotNull only |
| DECIMAL(p,s) → NUMBER same scale | Custom range if business rule specifies |
| DECIMAL(p,s) → NUMBER s2<s | Note precision loss; tolerance check if diff>2 |
| CHAR(1) → VARCHAR(10) | Signals CASE decode — check Transform column |
| INT/BIGINT → NUMBER(18,0) | Recon numeric equality |

**Approved Values:** comma/pipe list → ValidValues on target. ISO standard name → ValidValues. Free text → skip (use
Business Rule column).

**Format / Pattern:**
| Content | Check | Expression |
|---|---|---|
| Regex(^...$) | Custom | S.[col] ==~ /pattern/ |
| yyyy-MM-dd (DATE/TIMESTAMP col) | Date | dateFormat=yyyy-MM-dd |
| yyyy-MM-dd HH:mm:ss (DATE/TIMESTAMP col) | Date | dateFormat=yyyy-MM-dd HH:mm:ss |
| dd/MM/yyyy (TEXT col) | Custom | S.[col] != null && S.[col] ==~ /^\d{2}\/\d{2}\/\d{4}$/ |
| dd/MM/yyyy HH:mm:ss (TEXT col) | Custom | S.[col] != null && S.[col] ==~ /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/ |
| MM/dd/yyyy (TEXT col) | Custom | S.[col] != null && S.[col] ==~ /^\d{2}\/\d{2}\/\d{4}$/ |
| yyyyMMdd (TEXT col) | Custom | S.[col] != null && S.[col] ==~ /^\d{8}$/ |
| yyyy-MM-ddTHH:mm:ss (TEXT col) | Custom | S.[col] != null && S.[col] ==~ /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/ |
| Alphanumeric/Numeric/Fixed code set | None | use Length + ValidValues instead |

**Min/Max Length:**
| Scenario | Check |
|---|---|
| Min=Max=N | Length equal to N |
| Min<Max | Custom: S.[col]!=null && S.[col].length()>=Min && S.[col].length()<=Max |
| Max only | Custom: S.[col]==null \|\| S.[col].length()<=Max |
| Min only | Custom: S.[col]!=null && S.[col].length()>=Min |

**Transformation Logic:**
| Pattern | Action |
|---|---|
| Direct / Renamed X→Y | Recon simple equality (map col names) |
| Cast DATETIME→DATE | Date check on target; Recon custom date compare |
| Map A→X, B→Y (decode) | ValidValues on target + Recon custom value map |
| Truncate to N chars | Length=N on target + Recon custom |
| Trim whitespace | Custom non-empty on target |
| Uppercase enforced | Custom: S.[col]==S.[col].toUpperCase() |
| Default to VALUE if null | Target NotNull only |
| FORMULA A=BxC | Custom computed on target |
| Reject/unmapped rejected | Pushdown on reject table |
| Lookup/cross-ref table | Pushdown referential integrity |
| Split A into B+C | Skip Recon for A; NotNull on B+C if Mandatory |
| Encrypt/hash/anonymize | Skip |
| CDC/audit cols (batch_id, load_ts) | Skip unless Business Rule constrains |

**Severity:** CRITICAL/BLOCKER/P1 → create+flag. HIGH/P2 → create normally. MEDIUM/P3 → create+note. LOW/P4 → ask user
first.

---

## STEP 3 — BUSINESS RULE FREE TEXT

| Business rule text                        | Check                     | Groovy (TRUE=PASS)                                                                                                              |
|-------------------------------------------|---------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| must not be null / must be populated      | NotNull                   | —                                                                                                                               |
| non-null and non-empty                    | Custom                    | S.[col]!=null && S.[col].trim()!=""                                                                                             |
| must not be zero                          | Custom                    | S.[col].compareTo(java.math.BigDecimal.ZERO)!=0 [Snowflake] or S.[col]!=0 [SS]                                                  |
| must be > 0                               | Custom                    | S.[col].compareTo(java.math.BigDecimal.ZERO)>0 [Snowflake] or S.[col]>0 [SS]                                                    |
| must be >= 0                              | Custom                    | S.[col].compareTo(java.math.BigDecimal.ZERO)>=0 [Snowflake] or S.[col]>=0 [SS]                                                  |
| must be exactly N chars                   | Length                    | equal to N                                                                                                                      |
| must be one of [values]                   | ValidValues               | listed values                                                                                                                   |
| must match pattern / regex                | Custom                    | S.[col]==~/regex/                                                                                                               |
| must not be future date (DATE col)        | Custom                    | S.[col]!=null && S.[col]<=new Date()                                                                                            |
| must not be future date (TEXT dd/MM/yyyy) | Custom                    | S.[col]!=null && { try{def d=new java.text.SimpleDateFormat("dd/MM/yyyy").parse(S.[col]);d.before(new Date())}catch(e){false} } |
| must be >= FIXED_DATE                     | Custom                    | S.[col]>=Date.parse('yyyy-MM-dd','YYYY-MM-DD')                                                                                  |
| must be >= COLUMN_B (DATE cols)           | Custom                    | S.[col_a]!=null && S.[col_b]!=null && !S.[col_a].before(S.[col_b])                                                              |
| ABS(X-YxZ)<=N                             | Custom computed           | (S.[A].subtract(S.[B].multiply(S.[C]))).abs().compareTo(new java.math.BigDecimal("N"))<=0                                       |
| negative only valid when TYPE='X'         | Custom cross-col          | (S.[type]=='X'&&S.[qty].compareTo(BigDecimal.ZERO)<0)\|\|(S.[type]!='X'&&S.[qty].compareTo(BigDecimal.ZERO)>0)                  |
| zero only when TYPE='X'                   | Custom cross-col          | S.[col].compareTo(BigDecimal.ZERO)>=0&&(S.[col].compareTo(BigDecimal.ZERO)>0\|\|S.[type]=='X')                                  |
| mandatory for TYPE='X'                    | Custom cross-col          | S.[type]!='X'\|\|S.[col]!=null                                                                                                  |
| if A populated, B must also be            | Custom                    | S.[a]==null\|\|S.[b]!=null                                                                                                      |
| X and Y mutually exclusive                | Custom                    | !(S.[x]!=null&&S.[y]!=null)                                                                                                     |
| cannot be backdated > N days              | Custom                    | S.[col]>=new Date().minus(N).format("yyyy-MM-dd")                                                                               |
| sum of child = parent                     | Pushdown                  | SELECT id,ABS(SUM(child)-parent) FROM … GROUP BY id HAVING ABS(…)>tol                                                           |
| SCD is_current/expiry pattern             | Custom                    | (S.[is_current]==true&&S.[expiry]==null)\|\|(S.[is_current]==false&&S.[expiry]!=null)                                           |
| placeholder values (TBD/N/A/TEST)         | Custom                    | !(S.[col] in ['TBD','N/A','TEST','PLACEHOLDER','UNKNOWN'])                                                                      |
| must be unique / no duplicate             | Duplicate                 | Duplicate rule                                                                                                                  |
| must exist in TABLE                       | Pushdown                  | SELECT c.key FROM child c LEFT JOIN parent p ON c.key=p.key WHERE p.key IS NULL                                                 |
| alert if >N% / exceeds threshold          | Pushdown                  | SELECT CASE WHEN …>N/100.0 THEN 1 END FROM tbl — 0 rows=pass                                                                    |
| row count must match                      | Checksum COUNT + Pushdown | both                                                                                                                            |
| SUM(col) must reconcile within +-N        | Checksum SUM              | Math.abs(S.[SUM]-T.[SUM])<=N                                                                                                    |

Cross-column rules → same Target Validation rule. "Alert if" → Pushdown only when numeric threshold/SQL explicitly
defined.

---

## STEP 4 — CROSS-TABLE RELATIONSHIPS

| Relationship                     | Rule                                                                                                                       |
|----------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| FK child.key→parent.key          | Pushdown: SELECT c.key FROM child c LEFT JOIN parent p ON c.key=p.key WHERE p.key IS NULL                                  |
| Zero orphan tolerance / CRITICAL | Blocker Pushdown (same SQL)                                                                                                |
| Row count must match             | Checksum COUNT: S.[SRC_CNT]-T.[TGT_CNT]==0                                                                                 |
| SUM(col) within +-N              | Checksum SUM SQL: Math.abs(S.[SRC_SUM]-T.[TGT_SUM])<=N                                                                     |
| SUM per GROUP                    | Pushdown: SELECT grp,ABS(SUM(src)-SUM(tgt)) FROM … GROUP BY grp HAVING ABS(…)>tol                                          |
| SUM(pct) per group=100           | Pushdown: SELECT grp,SUM(pct) FROM tbl GROUP BY grp HAVING ABS(SUM(pct)-100)>0.0001                                        |
| Self src-tgt reconciliation      | Checksum COUNT + Checksum SUM + Recon                                                                                      |
| Proportion >N%                   | Pushdown: SELECT CASE WHEN CAST(SUM(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) AS FLOAT)/COUNT(*)>0.05 THEN 1 END FROM tbl |

---

## STEP 5 — GLOBAL REQUIREMENTS CHECK

| Global requirement                       | Verify                                            |
|------------------------------------------|---------------------------------------------------|
| All dates ISO 8601                       | Every date col has a Date check                   |
| Fixed-length identifiers                 | ISIN/CUSIP/SEDOL/currency cols have Length checks |
| Every record traceable via join key      | Recon includes the join key                       |
| Mandatory cols never null in target      | Every Mandatory=YES has target NotNull            |
| Row counts must match                    | Checksum COUNT rule exists                        |
| FK values must resolve                   | Pushdown for every FK                             |
| Computed cols reconcile within tolerance | Custom computed check in Target Validation        |
| Unique key cols no duplicates            | Duplicate rule for every UniqueKey=YES            |

---

## STEP 6 — PRE-PLAN TOOL CALLS (ALL required before Rule Plan)

Each rule type has a guidance doc with exact parameters, field specs, and file connection workflows — pulling it before building that rule keeps you on the right path.

**6a Validation (source + target):**

DB connection:
1. `fetch_db_sample_data` — inspect values, nulls, formats
2. `profile_data` — null rates, distinct counts, type confirmation
3. `suggest_quality_checks` — cross-reference with extracted signals
4. `get_guidance('create_validation_rules')` + `get_guidance('groovy_expressions')`

File connection:
1. Sample data already returned by `fetch_file_sample_data` from Step 1
2. `profile_data` on returned rows — inspect actual value distributions (flat-file columns always start as "Text")
3. `get_guidance('create_validation_rules')` — has the update_rule checksToAdd pattern for file rules

**6b Duplicate:** `profile_data` on key cols — confirm distinct=total; `get_guidance('create_duplicate_rules')`

**6c Checksum:**
- DB: reuse profile row counts; SQL mode: `fetch_db_sample_data` on each SQL (1 row, 1 non-NULL numeric, no error); `get_guidance('create_checksum_rules')`
- File: `fetch_file_sample_data(ruleType="Checksum")` already done; `get_guidance('create_checksum_rules')` — especially important for flat-file aggregation column selection

**6d Recon:** `analyze_recon_mapping` → confirm join key + column mapping; `get_guidance('create_recon_rules')`
Use results to: confirm join key alignment; identify decode/type-cast cols needing custom expressions; flag SKIP cols.

**6e Pushdown:**
- DB: `fetch_db_sample_data` on child+parent tables; `get_guidance('create_pushdown_rules')`
- File: sample data from `fetch_file_sample_data`; `get_guidance('create_pushdown_rules')`

**Checklist before Rule Plan:**

- [ ] Connections resolved · Schemas/files confirmed · Tables/columns confirmed
- [ ] DB: fetch_db_sample_data + profile_data + suggest_quality_checks | File: fetch_file_sample_data columns + data inspected
- [ ] analyze_recon_mapping done (if join key exists)
- [ ] get_guidance('groovy_expressions') + get_guidance('create_<rule_type>_rules') for each planned rule type

---

## STEP 7 — RULE PLAN (present; wait for approval before creating)

```
CONNECTION TYPE: DB | File | Mixed
SOURCE VALIDATION: {SrcTable}_Source_Checks | conn | schema.table (DB) or fileName (File)
  col · checkType · params [source: mapping row/profiling/suggested]
TARGET VALIDATION: {TgtTable}_Target_Checks | conn | schema.table
  col · checkType · params [+ cross-column business rule checks]
DUPLICATE: {Table}_{Col}_Duplicate_Check | columns:[...] | source: UniqueKey=YES/Business Rule
CHECKSUM: {Src}_vs_{Tgt}_RowCount_Checksum | Table mode (DB) or fetch_file_sample_data flow (File)
          {Src}_vs_{Tgt}_{Col}_Sum_Checksum | SQL mode | src SQL … | tgt SQL … | expression …
RECON:    {Src}_vs_{Tgt}_Recon | join: src.col=tgt.col
  src.col→tgt.col [direct/renamed/decoded/type-cast/SKIP]
PUSHDOWN: {Child}_{Parent}_RefIntegrity_Pushdown | SQL (0 rows=pass)
TOTAL: X rules / Y types · CRITICAL: [list]
```

Modify plan if user requests; re-confirm before proceeding.

---

## STEP 8 — EXECUTION ORDER

**DB connections:**
1. `create_validation_rule` source (one per source table) — get_guidance('create_validation_rules') has the exact checks schema
2. `create_validation_rule` target
3. `create_duplicate_rule`
4. `create_checksum_rule`
5. `create_recon_rule` — always call analyze_recon_mapping first; get_guidance('create_recon_rules') has join key patterns
6. `create_pushdown_rule` (CRITICAL first)

**File connections:**
1. `fetch_file_sample_data` → draft rule created (ruleId returned)
2. Profile returned sample data + suggest_quality_checks
3. `update_rule(ruleId, checksToAdd=[...])` → publishes (Validation/Pushdown)
4. For Recon/Checksum with DB target: `update_rule(ruleId, targetConfig={connectionId, schemaName, tableName}, ...)` → wires DB side and publishes

Confirm ruleId after each before proceeding.

---

## STEP 9 — POST-CREATION

Offer: (1) group into workflow (2) schedule (3) move to folder.
Multi-sheet: ask "Move to next table?"
CRITICAL rules: confirm stopIfFails with user.

---

## ANTI-PATTERNS

**Parsing:** Find header row first. Never assume column positions by number. Never treat title rows as data rows. Parse
each sheet header independently.

**Columns:** Only use columns from `list_connection_metadata(entity="column")` (DB) or returned by `fetch_file_sample_data` (File). Flag phantoms. Never propose Rule Plan until all schemas/tables/columns confirmed.

**Rule design:** ONE Validation rule per table. Cross-column checks → Target Validation. Never validate CDC/audit cols
unless Business Rule constrains. Never use Pushdown when Validation/Checksum/Recon fits.

**Mandatory/Unique:** YES→NotNull both sides, unless Transform says "Default if null" (target only).
UniqueKey=YES→Duplicate both sides unless doc says source uniqueness not guaranteed.

**Fan-in:** One Source Validation per source table — never combine.

**Severity:** Never skip CRITICAL/BLOCKER. Never auto-create LOW/INFO — ask user.

**File connections:** NEVER call create_validation_rule / create_recon_rule / create_checksum_rule directly for file connections. Always start with `fetch_file_sample_data`. The draft is completed via `update_rule`. File columns always start as "Text" — inspect sample data values to determine real datatypes before designing checks.

**Process:** Complete Step 6 before Rule Plan. Present full plan before any create_* call. Pull `get_guidance('create_<rule_type>_rules')` for each rule type — it has the exact parameters, file connection handling, and expression patterns. Saves time and prevents mistakes.

**S.[col] vs T.[col] — CRITICAL:**

- Validation rules → ALWAYS S.[col] (even targeting DW/target table). Engine presents all rows as "source".
- T.[col] → ONLY in Recon rules (S.[col]=source row, T.[col]=target row).
- T.[col] in a Validation rule → errorCount=total rows, successCount=0 (100% error, engine crash). Confirmed production
  failure.
- Rule: create_validation_rule → S.[col] always. create_recon_rule → S.[col] source, T.[col] target.

**Snowflake NUMERIC/BigDecimal — CRITICAL:**

- Snowflake NUMBER/DECIMAL → Java BigDecimal at runtime. Raw operators (!=0, >=0, >0) throw ClassCastException → 100%
  error rate.
- Use: `S.[col].compareTo(java.math.BigDecimal.ZERO) != 0 / > 0 / >= 0`
- Tolerance: `(S.[A].subtract(S.[B].multiply(S.[C]))).abs().compareTo(new java.math.BigDecimal("0.01"))<=0`
- SQL Server INT/DOUBLE → direct operators safe. TEXT numeric → cast:
  `S.[col]==~/^-?\d+(\.\d+)?$/ && new BigDecimal(S.[col])>0`
- Confirm with `fetch_db_sample_data` + `typeof()` before writing arithmetic.

**DATE / TIMESTAMP expressions (canonical — use exactly):**

**iceDQ date parsing — always use `new Date().parse("fmt", value)` (confirmed from Groovy_Expressions_Overview.xlsx):**

- This is the iceDQ-native form. `new java.text.SimpleDateFormat().parse()` is NOT the preferred pattern for date
  parsing in iceDQ Groovy. Use `new Date().parse("fmt", S.[col])` for TEXT→Date conversion.
- `Date.parse('fmt','value')` (static form) works for literal date constants only. Use `new Date().parse()` for field
  values.

**DATE/TIMESTAMP col (icedqDatatype DATE or TIMESTAMP) — already a Java Date object, no parsing needed:**

- Null check + future guard: `S.[col]!=null && S.[col]<=new Date()`
- Year compare: `S.[col]!=null && S.[col]>new Date().parse('yyyy','2014')`
- Range:
  `S.[col]!=null && S.[col]>=new Date().parse('yyyy-MM-dd','2020-01-01') && S.[col]<=new Date().parse('yyyy-MM-dd','2024-12-31')`
- Format check (DATE col → format as string):
  `S.[col]!=null && new Date().parse("yyyy-MM-dd", S.[col].toString().substring(0,10)).format("yyyy-MM-dd")==~/\d{4}-\d{2}-\d{2}/`
- Ordering (both DATE cols): `S.[start]!=null && S.[end]!=null && !S.[end].before(S.[start])`
- Strip time portion: `S.[col]!=null && S.[col].clearTime()`
- Extract year: `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.get(Calendar.YEAR)`
- Extract month: `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.get(Calendar.MONTH)+1`
- Extract day: `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.get(Calendar.DAY_OF_MONTH)`
- Add N days: `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.add(Calendar.DATE,N); cal.getTime()`
- Add N months: `def cal=Calendar.getInstance(); cal.setTime(S.[col]); cal.add(Calendar.MONTH,N); cal.getTime()`
- Date diff in days: `def d1=S.[col1]; def d2=S.[col2]; (d1-d2).abs()`

**TEXT col (string-stored date) — regex guard first, then parse with new Date().parse():**

- Format guard dd/MM/yyyy: `S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4}$/`
- Format guard dd/MM/yyyy HH:mm:ss: `S.[col]!=null && S.[col]==~/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/`
- Format guard yyyyMMdd: `S.[col]!=null && S.[col]==~/^\d{8}$/`
- Format guard yyyy-MM-dd (string): `S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}$/`
- Format guard yyyy-MM-ddTHH:mm:ss: `S.[col]!=null && S.[col]==~/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/`
- Parse validity (try/catch — Validation rules only):
  `S.[col]!=null && { try{new Date().parse("dd/MM/yyyy",S.[col]);true}catch(e){false} }`
- TEXT→Date conversion: `def d = new Date().parse("yyyy-MM-dd", S.[col])`
- TEXT→String reformatted: `new Date().parse("yyyy-MM-dd", S.[col]).format("yyyy-MM-dd")`
- TEXT ordering (NEVER use >= on TEXT date strings — lexicographic ≠ chronological):
  `S.[start]!=null && S.[end]!=null && new Date().parse("dd/MM/yyyy",S.[start]).before(new Date().parse("dd/MM/yyyy",S.[end]))`
- Date diff from two TEXT cols:
  `def d1=new Date().parse("yyyy-MM-dd",S.[col1]); def d2=new Date().parse("yyyy-MM-dd",S.[col2]); (d1-d2)`

**instanceof guard — use when column type may be DATE or TEXT depending on platform:**

-

`if(!(S.[col] instanceof Date)) { def d=new Date().parse("yyyy-MM-dd",S.[col]); d.equals(T.[col]) } else { S.[col].equals(T.[col]) }`

**Recon cross-format expressions — target DATE always use .toString().substring(0,10):**

- src TEXT dd/MM/yyyy → tgt DATE:
  `S.[col]!=null && T.[col]!=null && new Date().parse("dd/MM/yyyy",S.[col]).format("yyyy-MM-dd")==T.[col].toString().substring(0,10)`
- src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (mandatory):
  `S.[col]!=null && T.[col]!=null && S.[col].substring(0,10)==T.[col].toString().substring(0,10)`
- src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (nullable):
  `S.[col]==null ? T.[col]==null : T.[col]!=null && S.[col].substring(0,10)==T.[col].toString().substring(0,10)`
  All 4 cases: src null+tgt null ✅ | src null+tgt value ❌ | src value+tgt null (orphan) ❌ | both values → compare ✅
- src DATE → tgt TEXT dd/MM/yyyy:
  `S.[col]!=null && T.[col]!=null && S.[col].format("dd/MM/yyyy")==T.[col]`
- src DATE → tgt TEXT yyyy-MM-dd:
  `S.[col]!=null && T.[col]!=null && S.[col].toString().substring(0,10)==T.[col]`

**Decision tree — always check icedqDatatype first:**

1. DATE/TIMESTAMP → Java Date object → use `.before()`, `.after()`, `.clearTime()`, `.format()`, Calendar API directly
2. TEXT → string → regex guard first, then `new Date().parse("fmt", S.[col])` to convert before comparing
3. Unknown/mixed → use `instanceof Date` guard
   Call `fetch_db_sample_data` (DB) or inspect `fetch_file_sample_data` data rows (File) to confirm actual runtime type before writing any date expression.

**Recon-specific ANTI-PATTERNS — CRITICAL (confirmed from production failures):**

- `SimpleDateFormat.format(T.[col])` on target DATE icedqDatatype → throws runtime exception. Snowflake DATE is
  java.sql.Date; its `.toString()` returns "yyyy-MM-dd" already. Use `T.[col].toString().substring(0,10)` or
  `T.[col].format("yyyy-MM-dd")` instead.
- `T.containsKey('col')` → NOT SUPPORTED. Orphan rows have T.[col]=null, not absent. Use `T.[col]==null` guard.
- `try { ... } catch(e) { false }` in Recon expressions → NOT SUPPORTED. try/catch is ONLY valid in Validation Custom
  checks.
- `Date.parse('fmt','value')` with a field variable → unreliable. Use `new Date().parse("fmt", S.[col])` for field
  values.
- `>= / <=` on TEXT date strings → lexicographic comparison, NOT chronological. Always parse first.

**Type conversion (for TEXT columns holding numeric values):**

- Preferred (reliable): `Integer.parseInt(S.[col])`, `Double.parseDouble(S.[col])`, `Float.parseFloat(S.[col])`
- Alternative (may not always work): `S.[col].toInteger()`, `S.[col].toDouble()`, `S.[col].toFloat()`
- Null-safe numeric cast: `S.[col]!=null && Integer.parseInt(S.[col])>=0`
