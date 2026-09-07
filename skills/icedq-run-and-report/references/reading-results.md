# Reading iceDQ run status and exception reports

> **Authoritative source.** The status values, field names, and codes below mirror
> `get_guidance('exception_report_analysis')` and `get_guidance('async_monitoring')` **as shipped with
> the customer's own server version**. Treat them as illustrative: call that guidance at runtime, and if
> the live response shape differs, trust the live response and the guidance over this file.

## Run status (get_workflow_run_status_or_result, action="status")
- **Running / Pending** → not done; keep polling (wait 2–3s between checks).
- **Success** → all checks passed.
- **Warning** → completed with failures/exceptions; there are rows or checks to look at.
- **Failed** → the run itself errored (often a wrong table, bad connection, or expression error),
  distinct from data that failed a check.

For a Pushdown rule, the exit code equals the number of failing rows (0 = pass); there is no
row-level exception report for Pushdown, only the count.

## Exception report (get_checks_exception_report)
- `checks[]` — per-check stats: `successCount`, `failureCount`, `errorCount`.
- `exceptions.data` — row-level detail with column values and per-check true/false flags.
- `errrow` — `"S"` = success row, `"E"` = exception (failure) row.
- `difftype` (Recon only) — `"ANB"` = source orphan (in source, not target),
  `"BNA"` = target orphan (in target, not source).
- Pagination — default page size is limited; pass `pageSize` (e.g. 100) and check
  `pageable.pages`. After a page, offer to fetch the next.

## Interpreting patterns (say the likely cause in plain terms)
- **High failures on one check** → a data quality problem in that specific column.
- **All checks fail** → usually the wrong table/connection or an expression error, not the data.
- **Recon, mostly ANB orphans** → the target isn't fully loaded yet (a volume/timing gap), not a
  quality defect.
- **Recon value mismatches** (e.g. M vs Male) → a value-mapping/transformation difference.
- **Duplicate rule, high count** → the business key is less unique than expected.

## How to report to a customer
1. One-line verdict: passed, or passed-except-for-N.
2. What N means in their terms ("42 customer records have no email").
3. The most likely cause, framed as a hypothesis, not a verdict.
4. Offer the next step: full detail, a UI link, or re-running after a fix.
