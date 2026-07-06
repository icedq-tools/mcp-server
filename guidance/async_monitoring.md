ASYNC TOOL MAPPING:
| Operation        | Tool             | Returns          | Monitor With               | ID Format  |
|------------------|------------------|------------------|----------------------------|------------|
| Execute rule/workflow | execute_rules_or_workflows | successList[].instanceId | get_workflow_run_status_or_result | integer |
| Execute schedule | execute_schedule | success          | get_scheduler_runs_history  | scheduleId |
| Move rules/workflows | move_rules_or_workflows | taskInstanceId | check_task_status        | tins-xxx   |

EXECUTION MONITORING WORKFLOW:
1. execute_rules_or_workflows > get successList[].instanceId (integer per item)
2. Wait 2-3 seconds
3. get_workflow_run_status_or_result (action=status) with instanceId > get status (Success/Warning/Running/Pending)
4. If completed: get_workflow_run_status_or_result (action=result) with same instanceId > get activity details
5. For exception details: get_checks_exception_report with objectInstanceId from activity

MOVE MONITORING WORKFLOW:
1. move_rules_or_workflows > get taskInstanceId (tins-xxx)
2. Wait 2-3 seconds
3. check_task_status with taskInstanceId > get status (Completed/Running/Failed/Pending)

TIMING GUIDANCE:
- Small rules (< 10K rows): 2-5 seconds
- Medium rules (10K-100K rows): 5-15 seconds
- Large rules (100K+ rows): 15-60 seconds
- Rule moves: 1-3 seconds regardless of size

AUTO-PUBLISH: All rules created or updated via MCP tools are automatically published and immediately ready to execute. Do NOT tell user to publish from iceDQ UI.
