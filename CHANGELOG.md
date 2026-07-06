# Changelog

All notable changes to the iceDQ MCP Server project are documented in this file.

---

## [1.0.2]

### Added
- **npm distribution** — distributed on the npm registry as
  [`@icedq/mcp-server`](https://www.npmjs.com/package/@icedq/mcp-server)
  (scoped public). MCP clients launch the server via
  `npx -y @icedq/mcp-server`; the `icedq-mcp-server` binary is also
  available via `npm install -g`.
- "Install via npm" section with a configuration reference table in
  `README.md`.
- `test_connection` — verify data source connectivity and credentials before use
- `get_exception_report_url` — direct iceDQ UI link to the exception report for a run

### Changed
- Standardized support email to `getsupport@icedq.com` across all docs and config.
- Major code refactoring with dependency injection pattern.
- Node.js esbuild configuration for single-bundle packaging.
- iceDQ config file externalized; removed hardcoded default IDs.

### Fixed
- Workflow publish and move issues.
- `list_rules` name filter and search bugs.
- Rule creation: removed hardcoded `connectorType`; duplicate `ruleName` handled gracefully.
- Datawarehouse custom query executor and base URL configuration.
- Error surfacing to MCP client improved.

---

## [1.0.0]

### Added
- Initial MCP server implementation, README, and documentation
- OAuth2/Keycloak authentication
- Pagination support for `list_connections` tool (`pageNo`, `pageSize` parameters)
- `list_workspaces` — list all workspaces
- `list_connections` — list data source connections
- `get_database_metadata` — get connection details and capabilities
- `list_databases` — list available databases for a connection
- `list_schemas` — list schemas for a connection or database
- `list_tables` — list tables for a schema
- `fetch_sample_data` — execute SQL and fetch real sample data (Table mode or Custom SQL mode)
- `profile_data` — analyze sample data for quality metrics
- `suggest_quality_checks` — check recommendations with Groovy syntax
- `create_validation_rule` — row-level validation rule creation (NotNull, ValidValues, Format, Length, Date, Custom)
- `create_pushdown_rule` — custom SQL aggregate validation (JOINs, GROUP BY, HAVING, referential integrity)
- `create_duplicate_rule` — detect duplicate records on single or multiple columns
- `create_folder` — create parent or child folders
- `list_folders` — list and search folders with hierarchy info
- `list_rules` — search and filter rules by name, folder, state, and type
- `execute_rule` — execute rules or workflows asynchronously
- `check_task_status` — monitor async operation status (rule/workflow moves)
- `get_rule` — fetch full rule details by ID or name
- `update_rule` — modify checks, source table, or name on existing rules; auto-detects rule type; auto-publishes after update
- `get_checks_exception_report` — row-level failure details for a rule run
- `get_rule_workflow_run_history` — paginated execution history for rules and workflows
- `check_workflow_run_status` — monitor real-time execution status of a workflow run
- `get_workflow_run_result` — retrieve detailed per-activity results after execution completes
- `get_scheduler_runs_history` — execution history of scheduled jobs
- `execute_schedule` — trigger a schedule on demand
- `create_checksum_rule` — cross-source numeric comparison (COUNT, SUM, AVG) between two connections
- `analyze_recon_mapping` — join key and column mapping suggestions for reconciliation
- `create_recon_rule` — row-level cross-source reconciliation with orphan and column-difference detection
- `create_workflow` — create multi-rule sequential execution workflows
- `add_rules_to_workflow` — append rules to an existing workflow with auto re-indexing
- `remove_rules_from_workflow` — remove rules from a workflow with auto re-indexing
- `move_rules` — move one or more rules between folders (async, use `check_task_status` to confirm)
- `move_workflows` — move one or more workflows between folders (async, use `check_task_status` to confirm)
- `list_workflows` — list all workflows with metadata and pagination
- `create_schedule` — Onetime, Daily, or Weekly schedules with timezone support
- `list_schedules` — list all schedules with pagination
- `modify_schedule` — update schedule timing, recurrence, and associated rules
- `add_rules_workflows_to_schedule` — add rules/workflows to an existing schedule
- `create_parameter` — create a reusable key-value parameter in a workspace folder
- `update_parameter` — update an existing parameter's name, description, or key-value pairs
- `parse_csv_and_create_parameter` — parse a CSV file and bulk-create a parameter from its contents
- `list_columns` — list column metadata for a table (cached)
- `datawarehouse_query_schema` — discover datasets, columns, metrics, and operators for warehouse queries
- `validate_and_explain_structured` — dry-run and explain a warehouse query before execution
- `datawarehouse_query_executor` — execute a structured, schema-validated warehouse query
- `get_guidance` — step-by-step guidance for complex multi-step iceDQ workflows
