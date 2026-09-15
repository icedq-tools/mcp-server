# Cross-platform reconciliation — where migrations quietly go wrong

A source-vs-target comparison across two different engines (SQL Server → Snowflake, Oracle →
Databricks, etc.) fails in two directions:

- **False positives** — a clean migration *looks* broken because the two sides are compared with
  mismatched sort, collation, type, or format. This is the more dangerous case: it buries the real
  signal under noise and erodes trust in the tool.
- **False negatives** — real drift hides because a comparison silently coerces both sides equal.

Get the compare right and the recon becomes trustworthy. The rules below are the ones that bite in
practice.

## 1. Sort alignment — the merge-join must see identically-ordered streams

iceDQ's Recon Diff Join is a **merge join**: it walks both sorted streams in lockstep. If the two
sides are not ordered identically by the join key, rows misalign and the rule reports almost
**every** key as both a source-only (`a-b`/`A-B`) *and* a target-only (`b-a`/`B-A`) orphan, with
only a few coincidental matches.

**Tell-tale symptom:** the same key value appears in *both* the source-orphan and target-orphan
lists, and the match count is far lower than the true overlap. That is an alignment artifact, not
schema/data drift. **Do not report it as a finding — fix the sort and re-run.**

Fixes, in order of robustness:

1. **`sortMode="none"` + explicit identical `ORDER BY` in both SQLs.** Add the *same* `ORDER BY`
   (e.g. `ORDER BY 1` on a case-normalised key) to the source and target queries so both engines
   emit the same order, and tell iceDQ the input is pre-sorted. Most deterministic for
   cross-platform keys.
2. **`sortMode="deferredSort"`** — iceDQ sorts internally. Correct in principle for cross-platform,
   but confirm alignment on your data; if it still misaligns, fall back to option 1.
3. **`sortMode="appendOrderBy"`** — each engine sorts itself. Only safe when both engines sort the
   key identically (plain ASCII, no collation ambiguity).

> Worked example: a cross-platform schema-parity recon on `INFORMATION_SCHEMA.COLUMNS` using
> `deferredSort` can report nearly every column as a false orphan on both sides, with only a
> handful coincidentally matching. Recreating it with `sortMode="none"` and an identical
> `ORDER BY 1` in both queries leaves only the genuine differences. Note that `create_recon_rule`
> accepts `sortMode` but `update_rule` does not — set it at create time, and recreate rather than
> patch if you need to change it.

## 2. Case-normalise the join key

Engines differ in how they store identifiers and string case. Snowflake `INFORMATION_SCHEMA` stores
object/column names **upper-case**; SQL Server preserves the declared case. Wrap the join key on
both sides so they match — e.g. `UPPER(COLUMN_NAME) AS COLUMN_NAME` in both queries — otherwise
identical keys fail to join.

## 3. Do not compare raw platform type names literally

SQL Server (`int`, `nvarchar`, `datetime2`) and Snowflake (`NUMBER`, `TEXT`, `TIMESTAMP_NTZ`) use
different type vocabularies, and Snowflake reports `VARCHAR` max length as `16777216`. A literal
`DATA_TYPE` or length compare therefore fails on **every** row and drowns the real signal. For a
schema-parity recon, join on column name and compare **nullability** (`IS_NULLABLE`, directly
comparable `YES`/`NO`), and keep `DATA_TYPE` in the SELECT for eyeballing only. If the customer
needs a true type comparison, build it with a **type-mapping** Custom check, not a literal compare.

## 4. Nullability drift is a real, common finding

Cloud targets often land every column as nullable. A source key that was `NOT NULL` (e.g. a
`CustomerKey`) arriving as nullable in the target is a **weakened contract**: the target engine
won't enforce it, so a bad load could insert null keys the source would have rejected. The
schema-parity recon (nullability check) surfaces this; the fix is a **NotNull Validation** on the
target column.

## 5. Numbers: compare with tolerance, not equality

`real`/`float` → `NUMBER(p,s)` rounds. Compare numeric columns with a small **tolerance**
(`Math.abs(S - T) <= 0.01`), not exact equality. Snowflake `NUMBER` surfaces as `BigDecimal` —
compare with `.compareTo(...) == 0`, not `==`.

## 6. Dates and timestamps: parse, then compare

Source dates are often strings or `DATETIME`; the target is `DATE`/`TIMESTAMP_NTZ`. Parse (or format
to a common `yyyy-MM-dd`) before comparing; never string-compare a string date against a real date.
Any timestamp re-typed to `TIMESTAMP_NTZ` must actually **convert**, not just re-label — watch for
silent timezone shifts.

## 7. Strings: trim, case, NULL-vs-empty, Unicode

Enable trimming and case-insensitive comparison for text columns; treat empty string as null where
appropriate; watch collation and accented/Unicode characters in names. iceDQ's SimpleCompare check
exposes `trimmingEnable`, `caseInsensitive`, `emptyStringAsNull`, `whiteSpaceAsNull`,
`ignoreDataType` — lean on these rather than hand-rolling Groovy.

## 8. Reading the exception report through the migration lens

- **High orphan count on one side (`a-b` or `b-a`)** usually means the target isn't fully loaded
  yet, not that data is wrong.
- **A "column diff" that hits every single row** is almost always a comparison artifact (types 3,
  5, 6 above) — fix the compare before calling it corruption.
- **Orphans on *both* sides for the *same* keys** = sort misalignment (rule 1).
- **A handful of specific column diffs on matched rows** = the genuine findings worth escalating.
