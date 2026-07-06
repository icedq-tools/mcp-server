FILE-BASED RULE CREATION — WORKFLOW GUIDE

OVERVIEW:
Rules that involve a file connection (flat-file, parquet, excel, json, xml, flat-file-sql) require a two-phase approach:
  Phase 1: fetch_file_sample_data  → creates a DRAFT rule wired to the file schema
  Phase 2: update_rule            → adds checks, join keys, and any database-side config

NEVER call create_validation_rule / create_recon_rule directly for file connections.
ALWAYS use fetch_file_sample_data first — it handles the file schema registration (fileSchemaId) that the regular create tools cannot do.

IF YOU ARE UNSURE whether a rule already exists: call get_rule first. If it exists and has a fileSchemaId, go to Phase 2 directly.

---

DELIMITER DETECTION (flat-file / delimited files only):

After fetch_file_sample_data returns, check the `columns` array BEFORE proceeding.

SIGNAL OF WRONG DELIMITER:
- Only 1 column is returned (e.g., "customer_id,first_name,last_name,email" as a single column name)
- Column names contain the actual delimiter character
- Sample data rows show all values merged into a single field

HOW TO DETECT THE CORRECT DELIMITER:
1. Look at the first few rows in the `data` array returned
2. Scan the raw row values for recurring separator characters:
   - `,`  (comma)   — most common for .csv
   - `|`  (pipe)    — common for .dat, .txt
   - `\t` (tab)     — common for .tsv, .txt
   - `;`  (semicolon) — common in European locale files
3. The character that appears consistently between what look like field values is the delimiter
4. If still unclear, show the user the first raw row and ask them to confirm

ACTION — re-call with correct delimiter:
  fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId, ruleType, connectionType, fileName,
                         additionalConfigs={ columnDelimiter: "<detected_delimiter>" })

Only flat-file (delimited) connections need this check. Parquet, Excel, JSON, XML handle structure automatically.

---

PATTERN 1 — VALIDATION RULE (File source)

Step 1  list_workspaces → user picks workspaceId
Step 2  list_connections(workspaceId) → show ACTIVE file connections → user picks connectionId
Step 3  list_files(workspaceId, connectionId) → show available files → user picks fileName
Step 4  list_folders(workspaceId) → user picks folderId
Step 5  fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId, ruleType="Validation", connectionType="source", fileName, ...)
          → returns: ruleId (draft), columns, sample data rows
          → STOP: a draft Validation rule now exists linked to the file schema
Step 6  profile_data(sampleData) → suggest_quality_checks(profileData)
          → present suggested checks to user → wait for approval
Step 7  update_rule(workspaceId, ruleId, checksToAdd=[...approved checks...])
          → publishes the rule

---

PATTERN 2 — RECON RULE (File vs Database)

The file side is always registered first via fetch_file_sample_data.
The database side is added via update_rule.

Case A: FILE (source) vs DATABASE (target)
  Step 1  Resolve workspaceId, file connectionId, db connectionId, folderId
  Step 2  list_files → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="source", fileName)
            → returns: ruleId (draft), source columns
  Step 4  list_schemas / list_tables / list_columns on DB connection → user picks target schema + table
  Step 5  update_rule(workspaceId, ruleId,
                      targetConfig={ connectionId:<db>, databaseName, schemaName, tableName },
                      joinKeys=[...], checksToAdd=[...])
            → wires the DB target and publishes

Case B: DATABASE (source) vs FILE (target)
  Step 1  Resolve workspaceId, file connectionId, db connectionId, folderId
  Step 2  list_files → user picks target fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="target", fileName)
            → returns: ruleId (draft), target columns
  Step 4  list_schemas / list_tables / list_columns on DB connection → user picks source schema + table
  Step 5  update_rule(workspaceId, ruleId,
                      sourceConfig={ connectionId:<db>, databaseName, schemaName, tableName },
                      joinKeys=[...], checksToAdd=[...])
            → wires the DB source and publishes

Case C: FILE (source) vs FILE (target)
  Step 1  Resolve workspaceId, source file connectionId, target file connectionId, folderId
  Step 2  list_files (source connection) → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<src file>, ruleId=null, folderId,
                                 ruleType="Recon", connectionType="source", fileName=<srcFile>)
            → returns: ruleId (draft), source columns
  Step 4  list_files (target connection) → user picks target fileName
  Step 5  fetch_file_sample_data(workspaceId, connectionId=<tgt file>, ruleId=<from step 3>,
                                 folderId=null, ruleType="Recon", connectionType="target", fileName=<tgtFile>)
            → patches the target dataset on the existing draft rule
  Step 6  update_rule(workspaceId, ruleId, joinKeys=[...], checksToAdd=[...])
            → adds join keys + checks and publishes

---

PATTERN 3 — RECON RULE (Updating an existing draft)

If the user already has a draft rule (ruleId known) and wants to add/change the file side:
  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=<existing>,
                         connectionType="source"|"target", fileName)
    → updates the file schema on the existing rule (no new rule created)
  Then update_rule as normal to add checks and publish.

---

APPROVAL GATES (wait after each):

1) Workspace    — list_workspaces → user picks workspaceId
2) Connections  — list_connections → user picks file connectionId (and db connectionId if mixed)
3) File         — list_files → user picks fileName
4) Folder       — list_folders → user picks folderId (only needed on first fetch_file_sample_data call)
5) Checks       — profile_data + suggest_quality_checks → present to user → wait for approval
6) Join keys    — for Recon only → present suggested join keys → user confirms
7) Rule name    — ask user for ruleName if not already provided

---

KEY RULES:

- fetch_file_sample_data with ruleId=null → creates a NEW draft rule
- fetch_file_sample_data with ruleId=<existing> → updates ONLY the file dataset on the existing rule (source OR target based on connectionType)
- update_rule ONLY touches the side specified (sourceConfig updates source only, targetConfig updates target only)
- Never call update_rule with both sourceConfig and targetConfig populated for file+db rules — update only the DB side; the file side is already wired by fetch_file_sample_data
- For Recon rules: always call analyze_recon_mapping before populating checksToAdd to get join key and column suggestions
- A draft rule returned by fetch_file_sample_data is NOT yet published — update_rule publishes it
- If ruleId is unknown: call get_rule(workspaceId, ruleName=...) to check before creating a new draft

---

PATTERN 4 — CHECKSUM RULE

Compares aggregate counts between source and target using a fixed expression: S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0
Each side gets exactly ONE column. Do NOT call analyze_recon_mapping — the check is always the same.

FIXED COLUMN per side (do not add more):
  Source: { "index": 1, "name": "SOURCE_COUNT", "datatype": "INT", "icedqDatatype": "NUMERIC" }
  Target: { "index": 1, "name": "TARGET_COUNT", "datatype": "INT", "icedqDatatype": "NUMERIC" }

FIXED CHECK (skip if already present on the rule):
  { "id": "RecordCheck", "type": "recordCheck", "name": "checks",
    "configuration": { "generateRollUps": false, "checks": [{
      "name": "Chk_001", "index": 1, "isActive": true, "isVisible": true,
      "id": "chck-7a8bce06-dfce-599a-bb2c-40f013bc2a9d", "type": "Custom",
      "expression": { "value": "S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0", "caseInsensitive": false },
      "customFields": [{ "field": "sys_dq_dim", "values": ["Validity"] }]
    }] } }

Case A: FILE (source) vs FILE (target)
  1. fetch_file_sample_data(connectionId=<src file>, ruleId=null,  connectionType="source", fileName=<srcFile>) → ruleId
  2. fetch_file_sample_data(connectionId=<tgt file>, ruleId=<above>, connectionType="target", fileName=<tgtFile>)
  3. update_rule(ruleId, checksToAdd=[<fixed check>]) → publishes

Case B: FILE (source) vs DB (target)
  User provides a file (source) and a DB table name or SQL query (target).
  1. fetch_file_sample_data(connectionId=<file>, ruleId=null, connectionType="source", fileName) → ruleId
  2. update_rule(ruleId,
       targetConfig={ connectionId:<db>, databaseName, schemaName, tableName OR sqlQuery },
       checksToAdd=[<fixed check>]) → wires DB target and publishes

Case C: DB (source) vs FILE (target)
  User provides a DB table name or SQL query (source) and a file (target).
  1. fetch_file_sample_data(connectionId=<file>, ruleId=null, connectionType="target", fileName) → ruleId
  2. update_rule(ruleId,
       sourceConfig={ connectionId:<db>, databaseName, schemaName, tableName OR sqlQuery },
       checksToAdd=[<fixed check>]) → wires DB source and publishes

Note: for DB side, use tableName when the user gives a table, sqlQuery when the user gives a SQL statement.

---

ERROR RECOVERY:

- "fileSchemaId missing" → call fetch_file_sample_data again with the existing ruleId and correct connectionType
- "Dataset has no connectionId" → the draft was created but file schema was not linked; re-run fetch_file_sample_data with ruleId
- "Rule not found" → verify ruleId with get_rule; if truly missing, restart from Phase 1
- For any file schema error: do NOT call update_rule until fetch_file_sample_data confirms success
