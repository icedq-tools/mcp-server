# iceDQ MCP Server - Use Cases & Workflows

Step-by-step workflows a user can perform with the iceDQ MCP Server through any MCP Client (e.g., Claude Desktop).

---

## Workflow 1: Discover Data Landscape & Profile Quality

Explore what data exists, understand its structure, and assess quality.

```
list_workspaces
  → list_connections (workspaceId)
    → get_database_metadata (connectionId)
      → list_databases (connectionId)
        → list_schemas (connectionId, databaseName)
          → list_tables (connectionId, schemaName)
            → list_columns (connectionId, tableName)
              → fetch_sample_data (connectionId, tableName)
                → profile_data (sampleData)
```

**What the user says:**
> "Show me all my workspaces, then list the connections in Production workspace. I want to explore the Snowflake connection - show me the databases, schemas, tables, and then fetch some sample data from the CUSTOMERS table and profile it."

---

## Workflow 2: AI-Suggested Quality Checks → Validation Rule Creation

Profile data and let AI suggest checks, then create a rule with those checks.

```
fetch_sample_data (connectionId, tableName)
  → profile_data (sampleData)
    → suggest_quality_checks (profileData)
      → create_validation_rule (folderId, ruleName, checks)
        → execute_rule (ruleId)
          → check_task_status (taskInstanceId)
            → get_rule_workflow_run_history (ruleId)
```

**What the user says:**
> "Fetch sample data from DIM_CUSTOMER, profile it, suggest quality checks, and create a validation rule with all the suggested checks. Then run it and show me the results."

---

## Workflow 3: Duplicate Detection on a Table

Find duplicate records on one or more columns.

```
list_workspaces
  → list_connections (workspaceId)
    → list_tables (connectionId, schemaName)
      → fetch_sample_data (connectionId, tableName)
        → create_duplicate_rule (connectionId, tableName, duplicateColumns)
          → execute_rule (ruleId)
            → check_task_status (taskInstanceId)
              → get_rule_workflow_run_history (ruleId)
```

**What the user says:**
> "Check for duplicate email addresses in the CUSTOMERS table. Also check if there are duplicate FirstName + LastName combinations."

---

## Workflow 4: Cross-Table Referential Integrity Check

Validate that foreign key relationships hold between tables using custom SQL.

```
list_connections (workspaceId)
  → list_tables (connectionId, schemaName)
    → list_columns (connectionId, tableName)  [for both tables]
      → create_pushdown_rule (connectionId, sql)
        → execute_rule (ruleId)
          → check_task_status (taskInstanceId)
            → get_rule_workflow_run_history (ruleId)
```

**What the user says:**
> "Create a pushdown rule to find orphan orders - orders where the customer_id doesn't exist in the customers table. Run it and tell me how many orphans were found."

---

## Workflow 5: End-to-End Quality Pipeline (Rules → Workflow → Schedule)

Create multiple rules, group them into a workflow, schedule it for recurring execution, and monitor results.

```
fetch_sample_data (table1) → profile_data → suggest_quality_checks
  → create_validation_rule (table1 checks)

fetch_sample_data (table2) → profile_data → suggest_quality_checks
  → create_validation_rule (table2 checks)

create_duplicate_rule (table1, duplicateColumns)
create_pushdown_rule (cross-table SQL)

  → create_workflow (all ruleIds, Sequential/Parallel)
    → create_schedule (workflowId, Daily/Weekly template)
      → execute_schedule (scheduleId)
        → get_scheduler_runs_history (scheduleId)
```

**What the user says:**
> "I need a full quality pipeline for my data warehouse. Profile DIM_CUSTOMER and FACT_ORDERS, create validation rules for both, add a duplicate check on customer email, and a referential integrity check between orders and customers. Bundle everything into a sequential workflow, schedule it to run daily at 6 AM, and execute it now so I can see the first results."

---

## Workflow 6: Organize Rules into Folders

Create a folder structure and move existing rules into the right folders.

```
list_folders (workspaceId)
  → create_folder (parentFolder)
    → create_folder (childFolder, parentId)
      → list_rules (workspaceId, nameFilter/stateFilter)
        → move_rules (destinationFolderId, ruleIds)
          → check_task_status (taskInstanceId)
```

**What the user says:**
> "Create a folder called Production_Checks with sub-folders Validation, Duplicates, and Integrity. Then move all my published validation rules into the Validation folder."

---

## Workflow 7: Manage Workflows (Add/Remove Rules, Execute, Monitor)

Build and modify workflows, then execute and track status in real-time.

```
list_rules (workspaceId)
  → list_workflows (workspaceId)
    → create_workflow (ruleIds, Sequential/Parallel)
      or add_rules_to_workflow (workflowId, newRuleIds)
      or remove_rules_from_workflow (workflowId, ruleIds)
        → execute_rule (workflowId)
          → check_workflow_run_status (instanceId)
            → get_rule_workflow_run_history (workflowId)
```

**What the user says:**
> "List my workflows. Add the new FACT_ORDERS rule to the Daily_DQ_Suite workflow. Remove the old deprecated rule. Then run the workflow and keep checking the status until it completes."

---

## Workflow 8: Schedule Automation & Monitoring

Create, modify, and monitor scheduled executions.

```
list_workflows (workspaceId)
  → create_schedule (workflowId, Daily/Weekly/Onetime template)
    or modify_schedule (scheduleId, updated config)
    or add_rules_workflows_to_schedule (scheduleId, ruleIds/workflowIds)
      → execute_schedule (scheduleId)
        → get_scheduler_runs_history (scheduleId)
```

**What the user says:**
> "Create a weekly schedule for the Daily_DQ_Suite workflow that runs every Monday and Friday at 8 AM EST. Also add the DIM_PRODUCT_Checks rule directly to the schedule. Show me the last 10 runs."

---

## Workflow 9: Parameterized Rule Configuration

Create reusable parameters and use them across rules, including bulk creation from CSV.

```
create_parameter (parameterName, key, value)
  or parse_csv_and_create_parameter (csvFilePath)
    → update_parameter (parameterId, updated key-value pairs)
```

**What the user says:**
> "Create a parameter called Validation_Thresholds with key MAX_NULL_PERCENT and value 5. Also, I have a CSV file with threshold values for each business unit - bulk-load it as parameters."

---

## Workflow 10: Data Warehouse Analytics & Reporting

Query iceDQ's data warehouse for execution trends and quality metrics.

```
datawarehouse_query_schema
  → validate_and_explain_structured (query payload)  [dry-run, see SQL]
    → datawarehouse_query_executor (query payload)  [execute]
```

**What the user says:**
> "Show me the query schema first. Then give me execution results for the last 30 days grouped by rule name and pass/fail status. First do a dry-run so I can see the SQL, then execute it."

---

## Workflow 11: Schema Discovery via Custom SQL

Use custom SQL queries to explore database metadata when standard metadata tools aren't sufficient.

```
list_connections (workspaceId)
  → get_database_metadata (connectionId)
    → fetch_sample_data (connectionId, customSql)
```

**What the user says:**
> "Run this custom SQL against the Snowflake connection:
> `SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'DATAOPS_DW' ORDER BY TABLE_NAME`"

---

## Workflow 12: Full Data Quality Assessment for a New Table

Complete end-to-end setup from discovery to monitored execution for a single table.

```
list_workspaces
  → list_connections (workspaceId)
    → list_schemas → list_tables → list_columns
      → fetch_sample_data (tableName)
        → profile_data (sampleData)
          → suggest_quality_checks (profileData)
            → list_folders / create_folder
              → create_validation_rule (row-level checks)
              → create_duplicate_rule (uniqueness checks)
              → create_pushdown_rule (aggregate/cross-table checks)
                → create_workflow (all ruleIds)
                  → execute_rule (workflowId)
                    → check_task_status (taskInstanceId)
                      → check_workflow_run_status (instanceId)
                        → get_rule_workflow_run_history (workflowId)
```

**What the user says:**
> "I just added a new FACT_PAYMENTS table. Set up everything - explore it, profile the data, suggest and create all quality checks (validation, duplicates, integrity), organize them in a new folder, create a workflow, run it, and show me the results."

---

## Quick Reference: Tool Chains

| Goal | Tool Chain |
|------|------------|
| Explore data | `list_workspaces` → `list_connections` → `list_databases` → `list_schemas` → `list_tables` → `list_columns` → `fetch_sample_data` |
| Profile & suggest checks | `fetch_sample_data` → `profile_data` → `suggest_quality_checks` |
| Create & run validation rule | `create_validation_rule` → `execute_rule` → `check_task_status` → `get_rule_workflow_run_history` |
| Create & run duplicate rule | `create_duplicate_rule` → `execute_rule` → `check_task_status` → `get_rule_workflow_run_history` |
| Create & run pushdown rule | `create_pushdown_rule` → `execute_rule` → `check_task_status` → `get_rule_workflow_run_history` |
| Build workflow & schedule | `create_workflow` → `create_schedule` → `execute_schedule` → `get_scheduler_runs_history` |
| Organize rules | `list_folders` → `create_folder` → `list_rules` → `move_rules` → `check_task_status` |
| Manage parameters | `create_parameter` / `parse_csv_and_create_parameter` → `update_parameter` |
| DW analytics | `datawarehouse_query_schema` → `validate_and_explain_structured` → `datawarehouse_query_executor` |
