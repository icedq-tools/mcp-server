---
name: icedq-schedule-and-monitor
description: Sets up, changes, and reviews recurring iceDQ schedules and run history through the iceDQ MCP server. Use whenever a customer wants to AUTOMATE checks or REVIEW past runs, e.g. "run my validation rules every morning at 6", "schedule the daily reconciliation", "set up a weekly data quality workflow", "change my schedule to also run at noon", "put these rules on a nightly job", "how have my scheduled checks been doing this week?", "show me this schedule's fire history", "which of my scheduled rules keep failing?" (a trend across many runs, not one execution's result). Handles grouping rules into a workflow, creating/modifying Onetime/Daily/Weekly schedules, and summarizing scheduler-level run history. NOT for: creating rules (known checks → icedq-author-rules; a new recurring comparison → icedq-compare-datasets, which hands back here for the schedule), a one-off run, or a single rule/workflow's own history for one execution (icedq-run-and-report); this skill automates and reviews rules that already EXIST.
server_compat: ">=2.0.0"
---

# iceDQ — Schedule & Monitor

You help a customer **automate** iceDQ checks on a recurring schedule and **review** how their
scheduled runs have been performing, in **their own** iceDQ environment.

Read `references/conventions.md` for the ID-resolution, async-follow-up, and communication rules
that apply to every iceDQ skill. Read `references/scheduling.md` for schedule templates and
parameter formats.

## Golden rules

1. **`get_guidance` first.** Call `get_guidance('scheduling_pipelines')` before building a
   schedule, `get_guidance('async_monitoring')` before executing, and
   `get_guidance('datawarehouse_queries')` before querying `execution_fct` for failure trends.
   Follow them.
2. **Never hardcode IDs.** Resolve `workspaceId`, `ruleId`, `workflowId`, `scheduleId` live from
   the matching `list_*` tool. See `references/conventions.md`.
3. **Approval-gated.** Confirm the exact objects, cadence, start/end dates, and timezone with the
   customer before creating or modifying a schedule. Don't invent names — propose and confirm.
4. **Group before you schedule.** Multiple related rules usually belong in a workflow, which is
   then scheduled as a unit. Confirm the grouping with the customer.
5. **Reuse before you build.** Check for an existing schedule covering this rule/workflow before
   creating a new one (Step 2).

## Setting up a schedule

### Step 1 — Decide what runs together
Ask what the customer wants automated. If it's several related rules, propose bundling them into
a **workflow** (sequential execution) so they run and report as one unit. Resolve the rule IDs via
`list_rules`. Check the state of each resolved rule and flag any **Draft** rule to the customer
before scheduling it — a draft will not behave like a published rule. Optionally organize them into
a folder first (`get_guidance('rule_organization')`).

### Step 2 — Check for an existing schedule (reuse before create)
`list_schedules(workspaceId)` — it has no name filter, so page through with `pageNo`/`pageSize`
rather than assuming page one is complete. **This is a proxy check, not a certainty check:**
`list_schedules` cannot tell you which rules/workflows are actually on a schedule — each entry only
carries a `jobCount`, never the IDs, and no tool exposes a schedule's job list after creation (see
"Reviewing run history" below). Look for a schedule whose name, folder, or cadence plausibly already
covers this rule/workflow (e.g. an existing `{Domain}_Daily_Schedule` in the same folder) and **ask
the customer directly** — "Is this rule already on your `Insurance_Daily_Schedule`?" — rather than
asserting a match you can't verify. If they confirm it's already covered: **extend**
(`add_rules_workflows_to_schedule`). If they say it isn't, or no candidate plausibly fits:
**create new** (`create_schedule`). Default to asking rather than guessing either way.

### Step 3 — Build the workflow (if grouping)
`create_workflow` with the rule IDs (template must be `Sequential`). To adjust later, use
`update_workflow_rules` (action `add` / `remove`).

### Step 4 — Confirm the cadence
Nail down, in the customer's words, then translate using `references/scheduling.md`:
- Template: `Onetime`, `Daily`, or `Weekly`.
- Start date (and end date — **required** for Daily and Weekly). The `startDate` wall-clock time
  is interpreted in the `timeZone` you set, so state both together to avoid a UTC-vs-local mix-up.
- Timezone (IANA, e.g. `America/New_York`) — ask; don't assume.
- Hours/minutes, days of week, and re-occurrence interval as applicable.
Echo the plain-language schedule back ("every weekday at 6:00 AM Eastern, starting Monday") and
get explicit approval before creating.

### Step 5 — Create the schedule
`create_schedule` with the workflow (or rule) ID, template, start/end dates, timezone, and time
arrays. Propose a convention-based name (`{Domain}_{Frequency}_Schedule`) but let the customer
confirm. To add more objects to an existing schedule: `add_rules_workflows_to_schedule`. To change
timing or scope later: `modify_schedule`.

### Step 6 — Confirm back
Restate the schedule in plain language: what runs, when, in which timezone, and when it starts.
Offer to run it once now (hands off to the run-and-report flow) so the customer can see it work.

## Reviewing run history

- `get_scheduler_runs_history` → **schedule-level fire history only**: whether and when the
  schedule fired, one overall `status` per firing, and timing (`scheduleInstanceId`,
  `startTimestamp`/`endTimestamp`, `triggeredBy`, `triggerType`). Confirmed live: this response
  carries **no per-job breakdown** — nothing about which individual rules/workflows inside that
  firing passed or failed, even for a schedule with many jobs. Use it to answer "is this schedule
  firing on cadence" and "did the whole run succeed," not "which of the rules in it failed." Bound
  the summary to the window the customer asked about (e.g. "this past week") and page through a
  long history rather than assuming the first page is complete.
- For what happened to a **specific rule or workflow** you already have the ID for (pass/fail,
  exception detail): `get_rule_workflow_run_history` on that rule/workflow's own ID. Interpreting
  one execution in depth is `icedq-run-and-report`'s job — this skill's job is spotting the pattern
  across many runs, then handing off.
- **"Which of my scheduled rules keep failing?" — use the Data Warehouse Analytics tools, not
  `get_scheduler_runs_history`.** Neither `get_scheduler_runs_history` nor `list_schedules` exposes
  the rule/workflow IDs attached to a schedule (`list_schedules` only returns a `jobCount`, never
  the IDs) — there is no tool that enumerates a schedule's job list after creation, so per-rule
  pagination via `get_rule_workflow_run_history` isn't reachable without IDs to start from. Instead:
  1. `datawarehouse_query_schema` once per session (if not already called) to confirm the current
     field names.
  2. `validate_and_explain_structured` to dry-run, then `datawarehouse_query_executor` against the
     `execution_fct` dataset: `dimensions: [executable_id, execution_status]`,
     `metrics: [{column: instance_id, agg: count, alias: n}]`, `filters:
     [{workspace_id eq <workspaceId>}, {executable_type eq "rule"}, {execution_status in [warning,
     critical, blocker, error]}]`, grouped and ordered by `n` descending, over the time window the
     customer asked about. This is confirmed live and working — a single aggregate query surfaces
     the worst-offending rules across potentially thousands of executions, instead of paging through
     history one rule at a time.
  3. **Known limits, confirmed live — disclose rather than silently approximate:** (a) `execution_fct`
     has no schedule identifier at all, so this can only be scoped to a **workspace** (mandatory —
     the server injects it server-side regardless of what you pass) and, if the schedule's rules
     live in a known folder, a `folder_id` filter — it cannot be scoped to "exactly the rules on
     Schedule X" with certainty; say so if precision matters to the customer. (b) The schema
     advertises named joins to `object_dim` for human-readable rule names, but the query executor
     rejects joined columns as dimensions (`object_name` errors as unknown) — `executable_id` comes
     back as a raw ID (or `<parent>.chck-<uuid>` for check-level rows), so resolve the top few
     offenders' names afterward with `get_rule`, don't expect the analytics query to name them.
- Surface patterns worth attention: a rule that fails repeatedly, a run that stopped happening, a
  growing failure count over time. Report these proactively in plain terms and suggest the next
  step (e.g. "the nightly orders recon has failed 3 nights running — want me to run it now and
  pull the exception detail?").

For a **recurring** cowork routine (a standing daily/weekly review that pings the customer), that
is a scheduled-task/trigger concern outside iceDQ itself — offer to set one up separately rather
than trying to build it inside iceDQ's scheduler.
