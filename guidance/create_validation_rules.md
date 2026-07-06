HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- This workflow is intended to be approval-gated. If the user does NOT provide explicit IDs/names for each choice, you MUST stop and ask.
- Do NOT auto-pick defaults when multiple options exist.

FILE CONNECTION DETECTION:
- File connection types: flat-file, parquet, excel, json, xml, flat-file-sql
- If the selected connection is any of these types → follow FILE CONNECTION FLOW below instead of the standard workflow.
- NEVER call create_validation_rule directly for file connections — use fetch_file_sample_data first.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects connectionId
   - If file type connection selected → skip gates 4 and go to FILE CONNECTION FLOW
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
   - If folder does not exist: call get_guidance('rule_organization'), propose folderName + parent folder, then ONLY create_folder after user approves.
4) Target selection (Table or Custom SQL) — DB connections only
   - Table mode: list_connection_metadata(entity="database") → (entity="schema") → (entity="table") → user selects databaseName/schemaName/tableName
   - Custom SQL mode: user provides customSql; confirm it returns required columns for checks
5) Checks approval
   - Present the suggested checks (and any manual edits) and WAIT for user approval (include/exclude/modify).
6) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate a ruleName.
7) Create rule
   - DB: create_validation_rule with ONE combined checks array for the selected table.
   - File: update_rule with approved checksToAdd (draft was already created by fetch_file_sample_data).
8) Optional execution (separate approval)
   - Only run execute_rules_or_workflows if user explicitly says to execute now.

---

STANDARD WORKFLOW (DB connections):
1. Identify target: Get connectionId (list_connections), then navigate database > schema > table (list_connection_metadata with entity="database" > "schema" > "table")
2. Get column metadata: list_connection_metadata(entity="column") to understand datatypes, PKs, nullability
3. Sample data: fetch_db_sample_data with databaseName="" for Azure SQL
4. Profile: profile_data with the sample data array
5. Get suggestions: suggest_quality_checks with the profile output
6. Review: Present suggested checks to user before creating
7. Create: Use create_validation_rule — combine ALL checks for the same table into ONE rule (avoid rule sprawl)
8. Execute: execute_rules_or_workflows (objectIds: [ruleId]) > get_workflow_run_status_or_result (action=status) > get_workflow_run_status_or_result (action=result)
9. Review exceptions: get_checks_exception_report for row-level failure details

---

FILE CONNECTION FLOW (flat-file, parquet, excel, json, xml, flat-file-sql):

Phase 1 — Register file schema and create draft rule:
  Step 1  list_files(workspaceId, connectionId) → show available files → user picks fileName
  Step 2  list_folders(workspaceId) → user picks folderId
  Step 3  fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId,
                                 ruleType="Validation", connectionType="source", fileName)
            → returns: ruleId (draft), columns, sample data rows
            → [flat-file] Delimiter check: if only 1 column returned or column names contain
              separator characters, read the data rows to find the real delimiter (`,` `|` `\t` `;`)
              and re-call with additionalConfigs={ columnDelimiter: "<correct>" } before continuing
            → STOP: a draft Validation rule now exists linked to the file schema

Phase 2 — Profile, approve checks, and publish:
  Step 4  profile_data(sampleData from fetch_file_sample_data) → suggest_quality_checks(profileData)
            → present suggested checks to user → wait for approval
  Step 5  Ask user for ruleName
  Step 6  update_rule(workspaceId, ruleId, ruleName, checksToAdd=[...approved checks...])
            → publishes the rule

ERROR RECOVERY for file rules:
- "fileSchemaId missing" → re-call fetch_file_sample_data with the existing ruleId and connectionType="source"
- "Dataset has no connectionId" → re-run fetch_file_sample_data with ruleId
- Do NOT call update_rule until fetch_file_sample_data confirms success
- "Rule not found" → verify ruleId with get_rule; if truly missing restart from Phase 1

---

GROOVY EXPRESSION PATTERN (Custom checks):
- All custom checks use TRUE = PASS, FALSE = FAIL
- Write expressions that describe VALID data conditions
- Examples:
  S.[salary] > 0                              > salary must be positive
  S.[email] != null && S.[email].trim() != "" > email must not be empty
  S.[age] >= 18 && S.[age] <= 120             > age must be in range
  S.[start_date] <= S.[end_date]              > dates must be in order
  S.[status] in ["Active","Pending","Closed"]  > status must be valid

SUPPORTED CHECK TYPES:
- NotNull: {checkType: "NotNull", column: "col"}
- ValidValues: {checkType: "ValidValues", column: "col", expectedValues: ["A","B"]}
- Format: {checkType: "Format", column: "col", pattern: "Email|Phone|SSN|ZipCode|URL|IP"}
- Length: {checkType: "Length", column: "col", expectedLength: 10, operator: "equal to"}
- Date: {checkType: "Date", column: "col", dateFormat: "yyyy-MM-dd"}
- Custom: {checkType: "Custom", column: "col", expression: "S.[col] > 0"}

ANTI-PATTERNS:
- Do NOT create separate rules per check — combine into ONE rule per table
- Do NOT use NotNull + Custom for same column — use Custom alone with null handling
- Do NOT use create_validation_rule for: duplicates (use create_duplicate_rule), cross-table (use create_pushdown_rule or create_recon_rule), row counts (use create_checksum_rule)

AZURE SQL QUIRK: Use databaseName="" (empty string) for fetch_db_sample_data, not the actual database name
