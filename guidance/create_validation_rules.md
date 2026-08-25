HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- This workflow is intended to be approval-gated. If the user does NOT provide explicit IDs/names for each choice, you MUST stop and ask.
- Do NOT auto-pick defaults when multiple options exist.

FILE CONNECTION DETECTION:
- File connection types: flat-file, parquet, excel, json, xml, flat-file-sql
- If the selected connection is any of these types → follow FILE CONNECTION FLOW below instead of the standard workflow.
- NEVER call create_validation_rule directly for file connections — use fetch_file_sample_data first.

SAP ECC VALIDATION RULES:
- SAP connection: connectorId="sap-ecc"
- ⚠️ **ALWAYS use customSql** for create_validation_rule (schemaName+tableName mode not supported)
- **Rule creation pattern:**
  1. list_connection_metadata(entity="table") → pick table
  2. list_connection_metadata(entity="column") → show columns to user
  3. Ask user: "Which columns to validate?" → user picks 8-12 columns max (512-byte limit)
  4. fetch_db_sample_data(customSql="SELECT col1,col2,... FROM TableName", limit=100)
  5. profile_data → suggest_quality_checks → present suggestions → WAIT for approval
  6. create_validation_rule(customSql="SELECT col1,col2,... FROM TableName", checksJson=...)
- Example: `customSql: "SELECT MANDT, MATNR, ERSDA, ERNAM FROM MARA"`
- **Crawling:** Required before first use. If metadata fails: "Run crawling in iceDQ UI first"

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
1. Navigate: list_connections → list_connection_metadata (database > schema > table)
2. Show columns: list_connection_metadata(entity="column") → present columns to user
3. Ask user: "Which columns do you want to validate?" → user selects columns
4. Sample data: fetch_db_sample_data (use selected columns only, limit=100)
5. Profile: profile_data with the sample data array
6. Suggest: suggest_quality_checks with the profile output
7. Approve: Present suggested checks → WAIT for user approval/modifications
8. Create: create_validation_rule with approved checks (ONE rule for all checks)
9. Execute (optional): execute_rules_or_workflows if user requests
10. Review exceptions: get_checks_exception_report for failures

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
