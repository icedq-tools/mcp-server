HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Recon rules compare row-level data across TWO sides (source vs target). This workflow must be approval-gated.
- Do NOT auto-pick source/target connections, tables, join keys, or mapped columns when multiple options exist.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Source + target connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects sourceConnectionId and targetConnectionId
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) Target selection (per side)
   - list_databases → list_schemas → list_tables for source → user selects database/schema/table
   - list_databases → list_schemas → list_tables for target → user selects database/schema/table
5) Mapping analysis + approval (required)
   - analyze_recon_mapping → present HIGH/MEDIUM/LOW matches
   - User confirms join key columns and which column checks to include
6) Result types + sort mode approval
   - Confirm which resultTypes to include: a-b (source orphans), b-a (target orphans), Xp (column diffs)
7) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
8) Create rule
   - create_recon_rule with approved join key and check columns as comma-separated strings
9) Optional execution (separate approval)
   - Only run execute_rule if user explicitly says to execute now.

WORKFLOW:
1. Identify source and target: Get both connectionIds from list_connections
2. Analyze mapping: Call analyze_recon_mapping with source/target connection+schema+table details
   - Returns column matches (HIGH/MEDIUM/LOW confidence), suggested join keys, unmatched columns
3. Review suggestions: Present the mapping analysis to user
   - HIGH confidence = exact name match > auto-include
   - MEDIUM = similar names > ask user to confirm
   - Unmatched columns may indicate transformations (e.g., FirstName+LastName > FullName)
4. Identify join keys: If analyze_recon_mapping didn't suggest keys, ask user for the business key columns
5. Create rule: create_recon_rule with comma-separated join key and check column strings
   - joinKeySourceColumns: "employee_id", joinKeyTargetColumns: "empid"
   - checkSourceColumns: "first_name,salary", checkTargetColumns: "name,salary"
6. Execute: execute_rule > check_workflow_run_status > get_workflow_run_result
7. Review exceptions: get_checks_exception_report — look at difftype column:
   - ANB = source orphan (exists in source, not in target)
   - BNA = target orphan (exists in target, not in source)
   - Check columns show "true"/"false" per row

CUSTOM CHECK PATTERN (MATCH PATTERN — TRUE = PASS):
- Recon custom checks use TRUE = PASS (same as validation)
- Write expressions that return TRUE when data is CORRECT
- Do NOT negate with !() — that inverts pass/fail
- Simple: {name: "Email", sourceColumn: "Email", targetColumn: "Email"} > generates S.[Email] == T.[Email]
- Custom value mapping example:
  (S.[Gender] == "M" && T.[Gender] == "Male") || (S.[Gender] == "F" && T.[Gender] == "Female") || (S.[Gender] == T.[Gender])

RESULT TYPES:
- a-b: Orphaned source rows (in source but not target)
- b-a: Orphaned target rows (in target but not source)
- Xp: Column mismatches (rows that matched on join key but have value differences)

NAMING CONVENTION: {SourceTable}_vs_{TargetTable}_Recon

COMMON ISSUES:
- High orphan count (a-b) usually means target hasn't been fully loaded, not a data quality issue
- Gender/Status/Code mismatches usually indicate value mapping transformations — use Custom expression
- Date format differences — source may store as string, target as date — compare with string conversion
