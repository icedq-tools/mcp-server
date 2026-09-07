# iceDQ MCP — shared conventions (customer environments)

These conventions apply to every interaction with the iceDQ MCP server. They exist because this
skill runs inside the **customer's own** iceDQ environment, where nothing can be assumed and
everything must be resolved live.

## 1. `get_guidance` is always the first tool call
Before any create / execute / schedule / report action, call `get_guidance` for the relevant
topic and follow it. It is the authoritative, up-to-date description of the workflow and field
specs, and it overrides anything remembered. Because each customer runs their **own** iceDQ
server version (frequently self-hosted on-prem), `get_guidance` ships *inside their server* and
is therefore always correct for their exact version. Any tool parameters, field names, enums, or
expression syntax reproduced in a skill's `references/` files are **illustrative only** — when
they differ from `get_guidance`, follow `get_guidance`. Topics include: `create_validation_rules`,
`create_recon_rules`, `create_pushdown_rules`, `create_duplicate_rules`, `create_checksum_rules`,
`data_profiling_workflow`, `async_monitoring`, `scheduling_pipelines`, `exception_report_analysis`,
`rule_organization`, `groovy_expressions`, `datawarehouse_queries`.

## 2. Resolve every ID at run time — never hardcode
All iceDQ IDs are prefixed UUIDs unique to the customer's tenant. Never use a name or a
remembered ID as an ID.

| Parameter          | Format      | Resolve via                         |
|--------------------|-------------|-------------------------------------|
| workspaceId        | wksc-{uuid} | list_workspaces                     |
| connectionId       | conn-{uuid} | list_connections                    |
| folderId           | fldr-{uuid} | list_folders                        |
| ruleId             | rule-{uuid} | list_rules                          |
| workflowId         | wkfl-{uuid} | list_workflows                      |
| scheduleId         | sche-{uuid} | list_schedules                      |
| instanceId         | integer     | returned by execute_rules_or_workflows |
| taskInstanceId     | tins-{uuid} | returned by async ops (moves)       |

Discovery chain for data: `list_connections` → `get_database_metadata(connectionId)` (check
`supportedHierarchy`) → `list_connection_metadata(entity="database"|"schema"|"table"|"column")`.

## 3. Human-in-the-loop by default
When more than one valid option exists, present the choices and wait. Do not auto-select, and do
not invent workspace/folder/rule names. This is production metadata in someone else's account —
treat every create/modify/delete as approval-gated.

## 4. Async operations must be followed up
- `execute_rules_or_workflows` → `successList[].instanceId` (integer) →
  `get_workflow_run_status_or_result(instanceId, action="status")` → when complete,
  `action="result"`. Wait 2–3s between polls; large rules (100K+ rows) can take 15–60s.
- `execute_schedule` → monitor via `get_scheduler_runs_history`.
- `move_rules_or_workflows` → `taskInstanceId` → `check_task_status`.
- Row-level failures → `get_rule_workflow_run_history` (note the run/instance id) →
  `get_checks_exception_report`.

Rules created or updated via MCP are **auto-published** and immediately runnable — never tell the
customer to publish from the UI.

## 5. Talk to the customer like a customer
Outputs are read by data owners and business users, not just engineers. Explain what a rule
checks, what a result means, and what to do next in plain, non-technical language — even when the
underlying mechanism (Groovy, join keys, aggregates) is technical. Lead with the business meaning
("42 customer rows are missing an email address"), then offer the detail if they want it.

## 6. If the server looks out of sync
Because each customer runs their own iceDQ server version, a skill bundle can be slightly ahead of
or behind the deployed server. If a tool the workflow needs is absent from the toolset, or
`get_guidance` returns nothing for an expected topic, do NOT improvise around it — tell the customer
their skills may not match their iceDQ server version and suggest reinstalling the skill bundle that
shipped with their server release. This skill set targets iceDQ server **>= 2.0.0** (see the
`server_compat` field in each SKILL.md).
