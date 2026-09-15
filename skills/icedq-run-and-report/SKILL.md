---
name: icedq-run-and-report
description: Runs existing iceDQ rules, workflows, or schedules through the iceDQ MCP server, waits for them to finish, and reports the results — including exception (failure) details — in plain language. Use whenever a customer wants to EXECUTE checks or SEE results, e.g. "run my customer validation rule", "run the daily data quality workflow", "did last night's checks pass?", "what's failing in the orders recon?", "show me the exception report", "how many rows failed?", "give me the results of the checksum rule", or "kick off the reconciliation and tell me what breaks". Handles execution monitoring (polling to completion) and exception-report retrieval, and summarizes pass/fail in business terms. Do NOT use this to CREATE new rules (ad-hoc checks → icedq-author-rules; a migration-test or reconciliation plan → icedq-compare-datasets), to set up schedules, or to review a schedule's cadence/health across many runs (icedq-schedule-and-monitor); use this for one specific rule/workflow/schedule's own most-recent execution.
server_compat: ">=2.0.0"
---

# iceDQ — Run & Report

You help a customer **execute existing iceDQ objects** (rules, workflows, or schedules) in **their
own** iceDQ environment and **explain the results** — especially failures — in plain language.

Read `references/conventions.md` for the ID-resolution, async-follow-up, and communication rules
that apply to every iceDQ skill. Read `references/reading-results.md` for how to interpret run
status and exception reports.

## Golden rules

1. **`get_guidance` first.** Call `get_guidance('async_monitoring')` before executing and
   `get_guidance('exception_report_analysis')` before pulling any exception report. Follow them.
2. **Never hardcode IDs.** Resolve `ruleId` / `workflowId` / `scheduleId` from the matching
   `list_*` tool in *this* environment. See `references/conventions.md`.
3. **Always follow up async work.** Execution is asynchronous — you must poll to completion and
   only then report results. Never report a result you haven't confirmed is complete.
4. **Default to link + stats; confirm before raw rows.** After a run, always show the check-level
   stats and the exception-report URL — that's usually enough. Only pull row-level exception data
   into chat if the customer explicitly asks, and default to a small page size when you do (see
   `references/conventions.md` §9).

## Workflow

### Step 1 — Identify what to run
Confirm the target with the customer and resolve its ID:
- Rule → `list_rules(workspaceId)` (use a `nameFilter` to narrow) → `ruleId`.
- Workflow → `list_workflows(workspaceId)` → `workflowId`.
- Schedule → `list_schedules(workspaceId)` → `scheduleId`.
If several match the customer's description, present them and let the customer choose. Resolve
`workspaceId` via `list_workspaces` first if not already known. If the customer is actually asking
to review a schedule's health/cadence across many runs ("has this been firing on time," "which of
my scheduled rules keep failing") rather than one specific execution, hand off to
`icedq-schedule-and-monitor` instead.

### Step 2 — Execute
Confirm the customer wants to run it now before you execute — a run is irreversible and can be
costly on large tables. Then:
- Rules / workflows: `execute_rules_or_workflows(objectIds=[...])` → capture each
  `successList[].instanceId` (an integer).
- Schedules: `execute_schedule(scheduleId)` → monitor via `get_scheduler_runs_history`.

### Step 3 — Poll to completion
Wait 2–3 seconds, then `get_workflow_run_status_or_result(instanceId, action="status")`. Repeat
until status is terminal (Success / Warning / Failed), not Running/Pending. Rough timing: small
rules 2–5s, medium 5–15s, large (100K+ rows) 15–60s. Let the customer know it's running rather
than going silent on long jobs.

### Step 4 — Get the outcome
When complete, `get_workflow_run_status_or_result(instanceId, action="result")` for pass/fail
and counts. Summarize in plain language first: what ran, whether it passed, and how many rows or
checks failed.

### Step 5 — Exception detail (default to link + stats; raw rows only on request)
Per `references/conventions.md` §9: as part of Step 4's summary, always include the exception
report link and the check-level stats already returned by `get_workflow_run_status_or_result`
(action="result") — `successCount`/`failureCount`/`errorCount` per check. Get the link via
`get_exception_report_url` (needs objectId, instanceId, ruleType, entityType — entityType="rule" or
"workflow"). If more than one completed instance exists, list them with date + status and let the
customer pick — do **not** auto-select the latest; find instances via
`get_rule_workflow_run_history` for a rule, or the workflow run result for a workflow.

Only call `get_checks_exception_report` — which returns row-level detail and can be very large —
if the customer explicitly asks to see failing rows here in the chat. Default to a small
`pageSize` (10–20) rather than pulling everything; offer the next page only if asked.

Then interpret whatever you pulled using `references/reading-results.md` and explain what the
failures mean in business terms and what likely caused them.

## Communication
Lead with the business meaning, not the mechanics. "The overnight customer checks passed except
for 42 rows missing an email address" beats "instanceId 90114 returned failureCount 42 on check
NotNull". Offer the technical detail second, for those who want it. Exception reports paginate —
after showing a page, offer to fetch the next.
