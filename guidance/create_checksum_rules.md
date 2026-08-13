HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Checksum rules compare TWO sides (source vs target). This workflow must be approval-gated.
- Do NOT auto-pick source/target connections, tables, or SQL when multiple options exist.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Source + target connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects sourceConnectionId and targetConnectionId
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) Mode selection (Table vs SQL) + target approval
   - Table mode: user selects database/schema/table for BOTH source and target (list_databases → list_schemas → list_tables)
   - SQL mode: user provides sourceSql + targetSql; confirm each returns exactly 1 row, 1 numeric column with alias
5) Check expression / tolerance approval
   - If a custom tolerance or percentage logic is needed, confirm the intended pass condition with user (TRUE = PASS).
6) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
7) Create rule
   - create_checksum_rule with approved source/target definitions
8) Optional execution (separate approval)
   - Only run execute_rule if user explicitly says to execute now.

WORKFLOW:
1. Identify source and target connections: Can be same or different platforms (e.g., SQL Server > Snowflake)
2. Decide mode:
   - Table mode: Provide sourceSchema+sourceTable and targetSchema+targetTable > auto-generates COUNT(*) SQL
   - SQL mode: Provide sourceSql and targetSql for SUM, AVG, or complex aggregates
3. Create rule: create_checksum_rule
4. Execute and check results

CHECK EXPRESSION PATTERN (TRUE = PASS):
- Default: S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0 > pass when counts match
- Tolerance: Math.abs(S.[SRC] - T.[TGT]) <= 10 > pass within 10 records
- Percentage: Math.abs(S.[SRC] - T.[TGT]) / S.[SRC] * 100 <= 1 > pass within 1%

REQUIREMENTS:
- Each SQL must return exactly 1 row, 1 numeric column
- Column must have an alias (SOURCE_COUNT, TARGET_COUNT, or custom)
- Source and target aliases must be different

NAMING CONVENTION: {SourceTable}_vs_{TargetTable}_Checksum

USE CASES:
- Row count validation after ETL load
- Sum validation (total premium, total claims)
- Cross-platform comparison (SQL Server vs Snowflake row counts)
