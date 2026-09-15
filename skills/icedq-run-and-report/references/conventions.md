# iceDQ MCP — shared conventions (customer environments)

These conventions apply to every interaction with the iceDQ MCP server. They exist because this
skill runs inside the **customer's own** iceDQ environment, where nothing can be assumed and
everything must be resolved live.

## Contents
1. get_guidance is always the first tool call
2. Resolve every ID at run time — never hardcode
3. Human-in-the-loop by default
4. Async operations must be followed up
5. Talk to the customer like a customer
6. If the server looks out of sync
7. Tool names and the MCP server
8. Separate business intent from rule type
9. Exception data — default to link + stats

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

**The approval gate is unconditional — never scale it to the environment.** Ask for explicit
go-ahead before any create/modify/delete in every workspace, every time, whether it looks like
PROD, SIT, a demo tenant, or a sandbox. Never phrase the ask as "since this is PROD, I want your
go-ahead" or otherwise imply confirmation would be optional in a lower environment — a customer
cannot always tell from a workspace name whether it is disposable, and the habit of gating
confirmation on perceived risk is exactly the habit that causes an ungated action in the one
environment that turns out to matter.

## 4. Async operations must be followed up
- `execute_rules_or_workflows` → `successList[].instanceId` (integer) →
  `get_workflow_run_status_or_result(instanceId, action="status")` → when complete,
  `action="result"`. Wait 2–3s between polls; large rules (100K+ rows) can take 15–60s.
- `execute_schedule` → monitor via `get_scheduler_runs_history`.
- `move_rules_or_workflows` → `taskInstanceId` → `check_task_status`.
- Row-level failures → `get_rule_workflow_run_history` (note the run/instance id) → default to
  `get_exception_report_url` + the check-level stats already in the result payload; only call
  `get_checks_exception_report` if the customer explicitly asks to see failing rows in chat (§9 —
  its response size scales with pageSize × configured checks and can be very large).

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

## 7. Tool names and the MCP server
All tool names in these skills (`list_workspaces`, `create_recon_rule`, …) belong to the iceDQ
MCP server. If multiple MCP servers are connected, qualify with the iceDQ server's registered
name (`<iceDQ server name>:tool_name`) — the registration name varies per customer, so resolve it
from the connected-server list rather than assuming one.

## 8. Separate business intent from rule type — in one plan, not two approvals
Every check or rule plan presented for approval states two labeled parts per item, together in that
same message — never as a second round-trip:
- **What & why** — the business question being tested and the risk it protects against, in plain
  language, driven by the data and the customer's stated need.
- **How** — the iceDQ rule type (`rule-taxonomy.md`) that implements it, and its mechanics.
Decide "what & why" first, from the data; never let "which rule type is easiest to build" decide
what gets tested — that is the failure this section exists to prevent. One approval covers both
parts.

## 9. Exception data — default to link + stats, confirm before pulling raw rows
After a run completes, two cheap items are enough for almost every conversation: the check-level
stats already present in the result payload (`successCount`/`failureCount`/`errorCount` per check)
and `get_exception_report_url` (a UI download link, tens of tokens). Present both by default — do
not wait to be asked.

`get_checks_exception_report`'s `exceptions.data` (row-level detail) is a different order of
magnitude: its size scales with `pageSize` × the number of checks configured on the rule, and a
single page can run to hundreds of thousands of tokens on a rule with many checks. Only call it
when the customer explicitly asks to see failing rows in the chat itself — never as the default
path to "show me what failed" — and when they do, default to a small `pageSize` (10–20) rather than
the tool's own default, offering more pages only if asked.
