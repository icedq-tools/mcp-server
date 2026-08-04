# iceDQ Rule Taxonomy — choosing the correct rule type

> **Authoritative source — read this.** The customer runs their **own** iceDQ server version (often
> on-prem), and its bundled `get_guidance` is the version-current source of truth for exact tool names,
> parameters, check types, enums, and expression syntax. Everything below is **illustrative** — the
> decision logic and naming that rarely change. Before building a rule, call
> `get_guidance('create_<type>_rules')` and follow it; if it disagrees with anything here, **get_guidance
> wins.**

Choosing the wrong rule type produces misleading results and rework. Use this decision guide
every time. When two types could fit, prefer the one whose *primary purpose* matches the
customer's real question.

## Decision guide (ask these in order)

1. **Is the customer comparing TWO datasets (source vs target)?**
   - Comparing **aggregates/totals** (row counts, sums, averages)? → **Checksum**
   - Comparing **row-by-row column values** on a join key (and finding orphans)? → **Recon**
2. **Is it a single dataset?**
   - Checking **uniqueness** of a key/column combination? → **Duplicate**
   - The check needs a **JOIN, GROUP BY/HAVING, referential integrity, or the table is large**,
     and the customer can express "bad rows" as SQL? → **Pushdown** (preferred for large tables)
   - Simple **row-level column checks** (not null, valid values, format, length, date, a per-row
     condition)? → **Validation**
3. **None of the above fit at all?** → **Script** (last resort only)

## The six types in detail

### Validation — row-level checks on one dataset
"Is each row well-formed?" One rule per table, all checks combined. Check types include (illustrative —
confirm the current set, parameters, and `Format` patterns via `get_guidance('create_validation_rules')`):
`NotNull`, `ValidValues`, `Format`, `Length`, `Date`, `Custom` (Groovy).
Custom expressions use **TRUE = PASS** — describe valid data, e.g. `S.[salary] > 0`,
`S.[age] >= 18 && S.[age] <= 120`, `S.[status] in ["Active","Pending","Closed"]`.
Do NOT combine `NotNull` + `Custom` on the same column — use `Custom` alone with null handling.
Naming: `{Table}_{Purpose}_Validation`.

### Duplicate — uniqueness of a business key
Prefer business keys (email, SSN, account number) over surrogate PKs. Snowflake/BigQuery/Redshift
do not enforce PKs, so duplicate checks are always worth it there; on Postgres/MySQL/Oracle/SQL
Server, skip columns already covered by an enforced PK/unique constraint. Single column checks
individual uniqueness; multi-column checks composite uniqueness. Not for fuzzy matching (use
Pushdown SQL). Naming: `{Table}_{Columns}_Duplicate_Check`.

### Pushdown — customer SQL that returns only bad rows
0 rows returned = pass; N rows = N failures. Preferred for large tables (runs in-database),
cross-table joins, GROUP BY/HAVING, referential integrity, staleness, threshold checks. The
customer supplies and approves the exact SQL. For flat-file connections SQL is not required.
Naming: `{Table}_{Check}_Pushdown`.

### Recon — row-by-row comparison of two datasets
Compares source vs target on a join key. Always run `analyze_recon_mapping` first to get join-key
and column-match suggestions (HIGH = auto-include, MEDIUM = confirm, unmatched may mean a
transformation). Result types (confirm the codes via `get_guidance('create_recon_rules')`): `a-b`
source orphans, `b-a` target orphans, `Xp` column diffs.
A high orphan count usually means the target isn't fully loaded (a volume gap), not a DQ defect.
Value mismatches (M vs Male) usually need a Custom mapping expression. Naming:
`{Source}_vs_{Target}_Recon`.

### Checksum — aggregate comparison of two datasets
Table mode auto-generates `COUNT(*)`; SQL mode takes a source and target SQL each returning
exactly 1 row / 1 aliased numeric column. Check expression uses TRUE = PASS, default
`S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0`; tolerance and percentage variants are supported.
Source and target aliases must differ. Naming: `{Source}_vs_{Target}_Checksum`.

### Script — last resort
Only when none of the five purpose-built types can express the check. Prefer a purpose-built rule
whenever possible; scripts are harder to maintain and reason about.

## Anti-patterns (do not do these)
- One rule per check → instead, ONE Validation rule per table with all checks.
- Using Validation for duplicates (use Duplicate), cross-table logic (use Pushdown/Recon),
  or row counts (use Checksum).
- Negating a custom expression with `!()` — it inverts pass/fail.
- Inventing rule or folder names — ask the customer.
