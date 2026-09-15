# Expression & platform recipes (Groovy, dates, types, tool gotchas)

Canonical, production-verified expression patterns shared by every skill that designs iceDQ
checks. Read the relevant section before writing ANY expression into a rule spec. Where these
differ from this server's `get_guidance('groovy_expressions')`, get_guidance wins.

## Contents
- S.[col] vs T.[col] — expression context rules
- Snowflake NUMERIC / BigDecimal handling
- DATE / TIMESTAMP expressions (DATE cols, TEXT-stored dates, instanceof guard)
- Recon cross-format date compares + decision tree
- Recon expression anti-patterns (confirmed production failures)
- Type conversion for TEXT-stored numerics
- Tool-argument gotchas (create_pushdown_rule args, databaseName 2-vs-3-tier, arithmetic overflow)

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
- Confirm via `fetch_db_sample_data` + `typeof()` before writing arithmetic.

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

- src TEXT yyyy-MM-dd HH:mm:ss → tgt DATE (Essential):
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
   Call `fetch_db_sample_data` (DB) or inspect `fetch_file_sample_data` data rows (File) to confirm actual runtime type before writing any date expression.

**Type conversion (TEXT columns holding numeric values):**

- Preferred (reliable): `Integer.parseInt(S.[col])`, `Double.parseDouble(S.[col])`, `Float.parseFloat(S.[col])`
- Alternative (may not always work): `S.[col].toInteger()`, `S.[col].toDouble()`, `S.[col].toFloat()`
- Number→String: `S.[col].toString()`
- Null-safe cast: `S.[col]!=null && Integer.parseInt(S.[col])>=0`

**Tool argument anti-patterns — CRITICAL (confirmed failures across ETL types):**

| Tool | Forbidden argument | Correct behaviour |
|------|--------------------|-------------------|
| `create_pushdown_rule` | `databaseName`, `schemaName` | Not supported → remove both; connection + SQL are sufficient |
| `execute_rules_or_workflows` | `ids` | Use `objectIds` (array of rule/workflow IDs) |
| `execute_rules_or_workflows` | `type` | Not supported → remove it |

**`databaseName` — 2-tier vs 3-tier connections:**
- **Azure SQL** does NOT support 3-part names (`db.schema.table`). Pass `databaseName: ""` (empty string) for:
  `list_connection_metadata`, `fetch_db_sample_data`. Passing the actual database name causes HTTP 400 `ResourceNotFound`.
- **Rule creation tools** (`create_validation_rule`, `create_checksum_rule`, `create_recon_rule`, `create_duplicate_rule`):
  use the actual database name for 3-tier connectors (SQL Server on-prem, Databricks, Snowflake); omit or pass `""` for Azure SQL.
- **Databricks / Snowflake**: pass the real catalog/database name as usual (3-tier: catalog.schema.table).

**Arithmetic overflow — SUM on large integer columns:**
- `SUM(ACCT_BAL)` where `ACCT_BAL` is INT → SQL Server throws arithmetic overflow for large datasets.
- Always cast at row level before aggregating: `SUM(CAST(col AS BIGINT))` or `SUM(CAST(col AS DECIMAL(18,2)))`.
- Never `CAST(SUM(col) AS DECIMAL)` — this casts the overflow result, not the individual values.
- Confirm via `fetch_db_sample_data` on the Checksum SQL before creating the rule.

**Recon date ANTI-PATTERNS — CRITICAL (confirmed production failures):**

- `SimpleDateFormat.format(T.[col])` on DATE icedqDatatype → throws. Use `T.[col].toString().substring(0,10)` or
  `T.[col].format("yyyy-MM-dd")`.
- `T.containsKey('col')` → NOT SUPPORTED. Orphan rows have T.[col]=null. Use `T.[col]==null` guard.
- `try/catch` in Recon expressions → NOT SUPPORTED. Only valid in Validation Custom checks.
- `Date.parse('fmt', S.[col])` with field variable → unreliable. Use `new Date().parse("fmt", S.[col])`.
- `>= / <=` on TEXT date strings → wrong. Always parse first with `new Date().parse()`.
