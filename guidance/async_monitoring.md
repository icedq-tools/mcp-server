ASYNC TOOL MAPPING:
| Operation        | Tool             | Returns          | Monitor With               | ID Format  |
|------------------|------------------|------------------|----------------------------|------------|
| Execute rule     | execute_rule     | instanceId       | check_workflow_run_status   | integer    |
| Execute schedule | execute_schedule | success          | get_scheduler_runs_history  | scheduleId |
| Move rules       | move_rules       | taskInstanceId   | check_task_status           | tins-xxx   |
| Move workflows   | move_workflows   | taskInstanceId   | check_task_status           | tins-xxx   |

EXECUTION MONITORING WORKFLOW:
1. execute_rule > get instanceId (integer)
2. Wait 2-3 seconds
3. check_workflow_run_status with instanceId > get status (Success/Warning/Running/Pending)
4. If completed: get_workflow_run_result with same instanceId > get activity details
5. For exception details: get_checks_exception_report with objectInstanceId from activity

MOVE MONITORING WORKFLOW:
1. move_rules > get taskInstanceId (tins-xxx)
2. Wait 2-3 seconds
3. check_task_status with taskInstanceId > get status (Completed/Running/Failed/Pending)

TIMING GUIDANCE:
- Small rules (< 10K rows): 2-5 seconds
- Medium rules (10K-100K rows): 5-15 seconds
- Large rules (100K+ rows): 15-60 seconds
- Rule moves: 1-3 seconds regardless of size

AUTO-PUBLISH: All rules created or updated via MCP tools are automatically published and immediately ready to execute. Do NOT tell user to publish from iceDQ UI.
