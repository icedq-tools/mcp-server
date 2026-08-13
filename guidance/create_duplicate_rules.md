HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- This workflow is approval-gated. If the user does NOT provide explicit IDs/names for each choice, you MUST stop and ask.
- Do NOT auto-pick defaults when multiple ACTIVE connections or multiple candidate tables/columns exist.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects connectionId
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) Target selection (Table or Custom SQL)
   - Table mode: list_databases → list_schemas → list_tables → user selects databaseName/schemaName/tableName
   - SQL mode: user provides customSql; confirm it returns the duplicateColumns
5) Duplicate columns selection (required user choice)
   - list_columns → propose candidate business keys → user confirms duplicateColumns
6) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
7) Create rule
   - create_duplicate_rule with the approved duplicateColumns
8) Optional execution (separate approval)
   - Only run execute_rule if user explicitly says to execute now.

WORKFLOW:
1. Identify table and candidate key columns
2. Check platform: Snowflake/BigQuery/Redshift do NOT enforce PKs — always worth checking
   PostgreSQL/MySQL/Oracle/SQL Server enforce PKs — skip PK columns, focus on business keys
3. Choose mode:
   - Table mode: schemaName + tableName + duplicateColumns
   - SQL mode: customSql + duplicateColumns (for filtered subsets or joins)
4. Create: create_duplicate_rule
5. Execute: execute_rule > check results
6. Review exceptions: get_checks_exception_report shows duplicate records with DUPLICATE_COUNT

COLUMN SELECTION:
- Single column: ["Email"] — checks individual uniqueness
- Multi-column: ["FirstName", "LastName", "DateOfBirth"] — checks composite uniqueness
- Business keys vs PKs: Prioritize business keys (email, SSN, account number) over surrogate PKs

NAMING CONVENTION: {Table}_{Columns}_Duplicate_Check

WHEN NOT TO USE:
- Database enforces PK/unique constraint on the columns — check is redundant
- Need fuzzy matching (similar but not exact) — not supported, use pushdown with custom SQL instead
