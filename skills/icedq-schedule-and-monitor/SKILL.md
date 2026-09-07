---
name: icedq-schedule-and-monitor
description: Sets up, changes, and reviews recurring iceDQ schedules and run history through the iceDQ MCP server. Use whenever a customer wants to AUTOMATE data quality checks or REVIEW how past runs went, e.g. "run my validation rules every morning at 6", "schedule the daily reconciliation", "set up a weekly data quality workflow", "change my schedule to also run at noon", "put these rules on a nightly job", "how have my scheduled checks been doing this week?", "show me the run history", or "which of my scheduled rules keep failing?". Handles grouping rules into a workflow, creating/modifying Onetime/Daily/Weekly schedules, and summarizing scheduler run history. Do NOT use this to create the rules themselves (use the authoring skill) or for a one-off manual run of an existing rule (use the run-and-report skill); use this for recurring automation and historical oversight.
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
   schedule and `get_guidance('async_monitoring')` before executing. Follow them.
2. **Never hardcode IDs.** Resolve `workspaceId`, `ruleId`, `workflowId`, `scheduleId` live from
   the matching `list_*` tool. See `references/conventions.md`.
3. **Approval-gated.** Confirm the exact objects, cadence, start/end dates, and timezone with the
   customer before creating or modifying a schedule. Don't invent names — propose and confirm.
4. **Group before you schedule.** Multiple related rules usually belong in a workflow, which is
   then scheduled as a unit. Confirm the grouping with the customer.

## Setting up a schedule

### Step 1 — Decide what runs together
Ask what the customer wants automated. If it's several related rules, propose bundling them into
a **workflow** (sequential execution) so they run and report as one unit. Resolve the rule IDs via
`list_rules`. Check the state of each resolved rule and flag any **Draft** rule to the customer
before scheduling it — a draft will not behave like a published rule. Optionally organize them into
a folder first (`get_guidance('rule_organization')`).

### Step 2 — Build the workflow (if grouping)
`create_workflow` with the rule IDs (template must be `Sequential`). To adjust later, use
`update_workflow_rules` (action `add` / `remove`).

### Step 3 — Confirm the cadence
Nail down, in the customer's words, then translate using `references/scheduling.md`:
- Template: `Onetime`, `Daily`, or `Weekly`.
- Start date (and end date — **required** for Daily and Weekly). The `startDate` wall-clock time
  is interpreted in the `timeZone` you set, so state both together to avoid a UTC-vs-local mix-up.
- Timezone (IANA, e.g. `America/New_York`) — ask; don't assume.
- Hours/minutes, days of week, and re-occurrence interval as applicable.
Echo the plain-language schedule back ("every weekday at 6:00 AM Eastern, starting Monday") and
get explicit approval before creating.

### Step 4 — Create the schedule
`create_schedule` with the workflow (or rule) ID, template, start/end dates, timezone, and time
arrays. Propose a convention-based name (`{Domain}_{Frequency}_Schedule`) but let the customer
confirm. To add more objects to an existing schedule: `add_rules_workflows_to_schedule`. To change
timing or scope later: `modify_schedule`.

### Step 5 — Confirm back
Restate the schedule in plain language: what runs, when, in which timezone, and when it starts.
Offer to run it once now (hands off to the run-and-report flow) so the customer can see it work.

## Reviewing run history

- `get_scheduler_runs_history` → summarize how recent scheduled runs went (dates, pass/fail).
  Bound the summary to the window the customer asked about (e.g. "this past week") and page through
  a long history rather than assuming the first page is complete.
- For a specific rule's history: `get_rule_workflow_run_history`.
- Surface patterns worth attention: a rule that fails repeatedly, a run that stopped happening, a
  growing failure count over time. Report these proactively in plain terms and suggest the next
  step (e.g. "the nightly orders recon has failed 3 nights running — want me to run it now and
  pull the exception detail?").

For a **recurring** cowork routine (a standing daily/weekly review that pings the customer), that
is a scheduled-task/trigger concern outside iceDQ itself — offer to set one up separately rather
than trying to build it inside iceDQ's scheduler.
