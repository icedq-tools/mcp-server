# iceDQ scheduling — templates and parameters

> **Authoritative source — critical here.** Exact schedule parameter names and formats vary by server
> version and are owned by `get_guidance('scheduling_pipelines')`, which ships with the customer's own
> iceDQ instance. The `Parameters` list below is **illustrative**; before calling `create_schedule`, call
> `get_guidance('scheduling_pipelines')` and use the parameter names and formats it returns. If they
> differ from this file, **get_guidance wins** — do not trust the reproduced formats blindly.

## Pipeline build order
1. Rules already exist (created via the authoring skill).
2. Organize into a folder: `create_folder` → `move_rules_or_workflows(type='rule')` (async →
   `check_task_status`).
3. Group into a workflow: `create_workflow` (template `Sequential`).
4. Schedule it: `create_schedule`.
5. Add more later: `add_rules_workflows_to_schedule`; change timing/scope: `modify_schedule`.

## Schedule templates
- **Onetime** — a single execution at a specified date/time.
- **Daily** — repeats every day at specified hours/minutes; `reoccur` sets interval
  (1 = once/day, 2 = every 2 hours, etc.). **endDate required.**
- **Weekly** — repeats on specified days of week at specified hours/minutes. **endDate required.**

## Parameters
- `startDate` — `"MM/DD/YYYY HH:mm:ss UTC"`, e.g. `"04/10/2026 08:00:00 UTC"`.
- `endDate` — required for Daily and Weekly.
- `timeZone` — IANA, e.g. `"America/New_York"`, `"UTC"`, `"Asia/Kolkata"`. Ask the customer.
- `template` — `"Onetime"` | `"Daily"` | `"Weekly"`.
- `hourArray` — hours as strings, e.g. `["8","14","20"]`.
- `minuteArray` — minutes as strings, e.g. `["0","30"]`.
- `daysOfWeek` — day numbers as strings, `0`=Sunday … `6`=Saturday.
- `reoccur` — Daily only; hourly interval within the day.

## Naming conventions (alphanumeric + underscores only)
- Folders: `{Domain}_{Environment}_Rules` (e.g. `Insurance_Staging_Rules`).
- Workflows: `{Domain}_{Purpose}_Workflow` (e.g. `Insurance_Quality_Workflow`).
- Schedules: `{Domain}_{Frequency}_Schedule` (e.g. `Insurance_Daily_Schedule`).

Always confirm the final cadence back to the customer in plain language before creating, and get
explicit approval — this is production automation in their account.
