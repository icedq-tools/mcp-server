HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Recon rules compare row-level data across TWO sides (source vs target). This workflow must be approval-gated.
- Do NOT auto-pick source/target connections, tables, join keys, or mapped columns when multiple options exist.

FILE CONNECTION DETECTION:
- File connection types: flat-file, parquet, excel, json, xml, flat-file-sql
- If either source or target connection is a file type → follow FILE CONNECTION CASES below instead of the standard workflow.
- NEVER call create_recon_rule directly for file connections — use fetch_file_sample_data first.
- The file side is ALWAYS registered first via fetch_file_sample_data; the DB side (if any) is added via update_rule.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Source + target connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects sourceConnectionId and targetConnectionId
   - If either connection is a file type → go to FILE CONNECTION CASES
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) Target selection (per side) — DB connections only
   - list_connection_metadata(entity="database") → (entity="schema") → (entity="table") for source → user selects database/schema/table
   - list_connection_metadata(entity="database") → (entity="schema") → (entity="table") for target → user selects database/schema/table
5) Mapping analysis + approval (required) — DB-only or after file schema is registered
   - analyze_recon_mapping → present HIGH/MEDIUM/LOW matches
   - User confirms join key columns and which column checks to include
6) Result types + sort mode approval
   - Confirm which resultTypes to include: a-b (source orphans), b-a (target orphans), Xp (column diffs)
7) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
8) Create rule
   - DB-only: create_recon_rule with approved join key and check columns as comma-separated strings
   - File involved: update_rule with joinKeys + checksToAdd (draft already created by fetch_file_sample_data)
9) Optional execution (separate approval)
   - Only run execute_rule if user explicitly says to execute now.

---

STANDARD WORKFLOW (DB-only connections):
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
6. Execute: execute_rule > get_workflow_run_status_or_result (action=status) > get_workflow_run_status_or_result (action=result)
7. Review exceptions: get_checks_exception_report — look at difftype column:
   - ANB = source orphan (exists in source, not in target)
   - BNA = target orphan (exists in target, not in source)
   - Check columns show "true"/"false" per row

---

FILE CONNECTION CASES:

Case A — FILE (source) vs DATABASE (target):
  Step 1  Resolve workspaceId, file connectionId, DB connectionId, folderId
  Step 2  list_files(workspaceId, fileConnectionId) → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="source", fileName)
            → returns: ruleId (draft), source columns
            → [flat-file] check columns: if only 1 column returned or names contain separator chars,
              detect real delimiter from data rows (`,` `|` `\t` `;`) and re-call with
              additionalConfigs={ columnDelimiter: "<correct>" } before continuing
  Step 4  list_connection_metadata on DB connection → user picks target schema + table
  Step 5  analyze_recon_mapping → present join key and column suggestions → user confirms
  Step 6  Ask user for ruleName
  Step 7  update_rule(workspaceId, ruleId, ruleName,
                      targetConfig={ connectionId:<db>, databaseName, schemaName, tableName },
                      joinKeys=[...], checksToAdd=[...])
            → wires the DB target and publishes

Case B — DATABASE (source) vs FILE (target):
  Step 1  Resolve workspaceId, DB connectionId, file connectionId, folderId
  Step 2  list_files(workspaceId, fileConnectionId) → user picks target fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="target", fileName)
            → returns: ruleId (draft), target columns
            → [flat-file] check columns: if only 1 column returned or names contain separator chars,
              detect real delimiter from data rows and re-call with additionalConfigs={ columnDelimiter: "<correct>" }
  Step 4  list_connection_metadata on DB connection → user picks source schema + table
  Step 5  analyze_recon_mapping → present join key and column suggestions → user confirms
  Step 6  Ask user for ruleName
  Step 7  update_rule(workspaceId, ruleId, ruleName,
                      sourceConfig={ connectionId:<db>, databaseName, schemaName, tableName },
                      joinKeys=[...], checksToAdd=[...])
            → wires the DB source and publishes

Case C — FILE (source) vs FILE (target):
  Step 1  Resolve workspaceId, source file connectionId, target file connectionId, folderId
  Step 2  list_files(workspaceId, srcConnectionId) → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<src file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="source", fileName=<srcFile>)
            → returns: ruleId (draft), source columns
            → [flat-file] check columns: if only 1 column or separator chars visible in names,
              re-call with additionalConfigs={ columnDelimiter: "<correct>" }
  Step 4  list_files(workspaceId, tgtConnectionId) → user picks target fileName
  Step 5  fetch_file_sample_data(workspaceId, connectionId=<tgt file>, ruleId=<from step 3>,
                                 folderId=null, ruleType="Recon", connectionType="target", fileName=<tgtFile>)
            → patches the target dataset on the existing draft rule
            → [flat-file] same delimiter check applies for the target file
  Step 6  analyze_recon_mapping → present join key and column suggestions → user confirms
  Step 7  Ask user for ruleName
  Step 8  update_rule(workspaceId, ruleId, ruleName, joinKeys=[...], checksToAdd=[...])
            → adds join keys + checks and publishes

KEY RULES for file connections:
- Never call update_rule with both sourceConfig and targetConfig populated for file+DB rules — update only the DB side; the file side is already wired by fetch_file_sample_data
- fetch_file_sample_data with ruleId=null → creates a NEW draft rule
- fetch_file_sample_data with ruleId=<existing> → updates ONLY the file dataset on the existing rule (source OR target based on connectionType)
- Always call analyze_recon_mapping before populating checksToAdd to get join key and column suggestions

ERROR RECOVERY for file rules:
- "fileSchemaId missing" → re-call fetch_file_sample_data with the existing ruleId and correct connectionType
- "Dataset has no connectionId" → re-run fetch_file_sample_data with ruleId
- Do NOT call update_rule until fetch_file_sample_data confirms success

---

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
