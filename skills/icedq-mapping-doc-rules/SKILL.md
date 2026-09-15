---
name: icedq-mapping-doc-rules
description: Uses a mapping document provided by the user (Excel, CSV, or Word source-to-target specification) to identify and design iceDQ rules — Validation, Duplicate, Checksum, Recon, Pushdown. Use whenever the user uploads or points to a mapping doc or ETL mapping sheet and wants checks derived from it, e.g. "create rules from this mapping document", "here is our source-to-target spec, generate the checks", "turn this column mapping into iceDQ rules". Analyzes the document and designs the checks, then emits approved rule specs (references/rule-spec.md) to icedq-author-rules Build mode, which performs the creation. NOT for: authoring without a mapping doc (icedq-author-rules, or icedq-suggest-checks for guidance), ETL/SQL code (icedq-etl-code-rules), migration/reconciliation planning (icedq-compare-datasets, which may invoke this skill), running or scheduling existing rules.
server_compat: ">=2.0.0"
---

## GOAL

Extract ALL quality rules from a column mapping spec. ONE Validation rule per table (all checks combined). Rule types:
Validation, Duplicate, Checksum, Recon, Pushdown.

**Output contract:** this skill designs and gets approval; it does NOT call `create_*` tools. The
approved Rule Plan is converted into **rule specs** (`references/rule-spec.md`) and handed to
**`icedq-author-rules` Build mode**, which validates, creates, and confirms each rule. Every
decision approved here travels in the spec — Build mode never re-asks (populated field = approved).

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

Analysis tooling runs here; **creation guidance (`get_guidance('create_*_rules')`) is Build mode's
job** — do not pull it in this skill.

**6a Validation (source + target):**

DB connection:
1. `fetch_db_sample_data` — inspect values, nulls, formats
2. `profile_data` — null rates, distinct counts, type confirmation
3. `suggest_quality_checks` — cross-reference with extracted signals
4. `get_guidance('groovy_expressions')` — before writing any Custom expression for a spec

File connection:
1. Sample data already returned by `fetch_file_sample_data` from Step 1 (note the returned draft
   ruleId — it goes into the spec as `existingDraftRuleId`)
2. `profile_data` on returned rows — inspect actual value distributions (flat-file columns always start as "Text")

**6b Duplicate:** `profile_data` on key cols — confirm distinct=total

**6c Checksum:**
- DB: reuse profile row counts; SQL mode: `fetch_db_sample_data` on each SQL (1 row, 1 non-NULL numeric, no error)
- File: `fetch_file_sample_data(ruleType="Checksum")` already done in Step 1

**6d Recon:** `analyze_recon_mapping` → confirm join key + column mapping.
Use results to: confirm join key alignment; identify decode/type-cast cols needing custom expressions; flag SKIP cols.
Cross-platform source/target → decide `sortMode` now (see `references/cross-platform-recon.md`); it
is create-time-only and must be in the spec.

**6e Pushdown:** DB: `fetch_db_sample_data` on child+parent tables to validate the SQL. File: sample data from `fetch_file_sample_data`.

**6f Existing rules (reuse before create):** `list_rules(workspaceId, nameFilter=<table name>)` →
for plausible matches, `get_rule` to confirm what they check → classify **reuse as-is / extend
(`update_rule`) / create new** per planned check. Drop anything already covered from the Rule Plan.

**Checklist before Rule Plan:**

- [ ] Connections resolved · Schemas/files confirmed · Tables/columns confirmed
- [ ] DB: fetch_db_sample_data + profile_data + suggest_quality_checks | File: fetch_file_sample_data columns + data inspected
- [ ] analyze_recon_mapping done (if join key exists) · sortMode decided for cross-platform recons
- [ ] get_guidance('groovy_expressions') pulled before any Custom expression was written
- [ ] list_rules checked for existing coverage · reuse/extend/create-new decided per check

---

## STEP 7 — RULE PLAN (present; wait for approval before creating)

Per `conventions.md` §8: precede this technical listing with one plain-language line per table —
what it tests and the risk it protects against — the template below is the **how**, not the whole
plan.

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

## STEP 8 — SPEC HANDOFF (Build mode creates)

Convert each approved Rule Plan line into a complete **rule spec** per `references/rule-spec.md`:
resolved IDs (workspace, connection, folder), datasets (table or SQL), checks with expressions,
join keys, result types, `sortMode` for cross-platform recons, criticality — and `producedBy:
icedq-mapping-doc-rules`. Anything the customer has not decided goes in `openQuestions`, not
guessed. File datasets carry `existingDraftRuleId` from Step 1 registration.

Hand the batch to **`icedq-author-rules` Build mode** in this order (it validates each spec,
creates, and returns the ruleId — confirm each before proceeding):

1. Source Validation spec(s) — one per source table
2. Target Validation spec(s)
3. Duplicate spec(s)
4. Checksum spec(s)
5. Recon spec(s)
6. Pushdown spec(s) — CRITICAL severity first

If Build mode flags a spec back (e.g. mis-typed rule, missing create-time setting), resolve it with
the customer here — the design decision belongs to this skill — and re-hand the corrected spec.

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

**File connections:** file schemas are registered with `fetch_file_sample_data` during Step 1 (this
creates a draft rule — carry its ruleId in the spec as `existingDraftRuleId`). File columns always
start as "Text" — inspect sample data values to determine real datatypes before designing checks.

**Process:** This skill calls NO `create_*` or `update_rule` tools — creation belongs to
`icedq-author-rules` Build mode via rule specs. Complete Step 6 before the Rule Plan. Present the
full plan and get explicit approval before handing any spec to Build mode.

**Expression & platform recipes:** ALL canonical Groovy expressions (dates, BigDecimal, type
conversion), S.[col]/T.[col] context rules, Recon expression anti-patterns, and tool-argument
gotchas live in [references/groovy-recipes.md](references/groovy-recipes.md). Read the relevant
section before writing ANY expression into a rule spec — these encode confirmed production
failures.
