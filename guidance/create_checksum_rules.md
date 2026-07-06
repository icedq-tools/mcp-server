HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Checksum rules compare TWO sides (source vs target). This workflow must be approval-gated.
- Do NOT auto-pick source/target connections, tables, or SQL when multiple options exist.

FILE CONNECTION DETECTION:
- File connection types: flat-file, parquet, excel, json, xml, flat-file-sql
- If either source or target connection is a file type → follow FILE CONNECTION CASES below instead of the standard workflow.
- NEVER call create_checksum_rule directly for file connections — use fetch_file_sample_data first.
- flat-file (FileStatic) is a SPECIAL CASE — after fetch_file_sample_data, you MUST ask the user to select a column and aggregation function before calling update_rule. See FLAT-FILE AGGREGATION SELECTION below.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Source + target connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects sourceConnectionId and targetConnectionId
   - If either connection is a file type → go to FILE CONNECTION CASES
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) Mode selection (Table vs SQL) + target approval — DB connections only
   - Table mode: user selects database/schema/table for BOTH source and target (list_connection_metadata entity="database" → "schema" → "table")
   - SQL mode: user provides sourceSql + targetSql; confirm each returns exactly 1 row, 1 numeric column with alias
5) Check expression / tolerance approval
   - If a custom tolerance or percentage logic is needed, confirm the intended pass condition with user (TRUE = PASS).
6) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
7) Create rule
   - DB-only: create_checksum_rule with approved source/target definitions
   - File involved: update_rule using checkExpression, sourceAlias, targetAlias (draft already created by fetch_file_sample_data)
8) Optional execution (separate approval)
   - Only run execute_rules_or_workflows if user explicitly says to execute now.

---

STANDARD WORKFLOW (DB-only connections):
1. Identify source and target connections: Can be same or different platforms (e.g., SQL Server > Snowflake)
2. Decide mode:
   - Table mode: Provide sourceSchema+sourceTable and targetSchema+targetTable > auto-generates COUNT(*) SQL
   - SQL mode: Provide sourceSql and targetSql for SUM, AVG, or complex aggregates
3. Create rule: create_checksum_rule
4. Execute and check results

---

FILE CONNECTION CASES:

For file connections, update_rule publishes the draft. Use these params:
- sourceConfig: connectionId (file connection) + filePath — for the file side
- targetConfig: connectionId (file connection) + filePath — for the file side
- sourceConfig: connectionId (DB connection) + schemaName + tableName OR sql — for the DB side
- targetConfig: connectionId (DB connection) + schemaName + tableName OR sql — for the DB side
- sourceAlias: alias for the source numeric column (default: SOURCE_COUNT)
- targetAlias: alias for the target numeric column (default: TARGET_COUNT)
- checkExpression: Groovy pass condition (default: S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0)
- ruleName: user-provided name

Case A — FILE (source) vs FILE (target):
  Step 1  Resolve workspaceId, source file connectionId, target file connectionId, folderId
  Step 2  list_files(workspaceId, srcConnectionId) → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<src file>, ruleId=null, folderId,
                                 ruleType="Checksum", connectionType="source", fileName=<srcFile>)
            → returns: ruleId (draft) + columns with sample data
  Step 3a [flat-file only] Delimiter check: if only 1 column returned or names contain separator chars,
            read data rows to detect real delimiter (`,` `|` `\t` `;`) and re-call with
            additionalConfigs={ columnDelimiter: "<correct>" } before continuing
  Step 3b [flat-file only] Inspect corrected columns → suggest column + function → ask user to confirm
            (see FLAT-FILE AGGREGATION SELECTION above)
  Step 4  list_files(workspaceId, tgtConnectionId) → user picks target fileName
  Step 5  fetch_file_sample_data(workspaceId, connectionId=<tgt file>, ruleId=<from step 3>,
                                 ruleType="Checksum", connectionType="target", fileName=<tgtFile>)
            → returns: updated draft + columns with sample data
  Step 5a [flat-file only] Inspect returned columns → suggest column + function → ask user to confirm
  Step 6  Ask user for ruleName and confirm check expression / tolerance
  Step 7  update_rule(workspaceId, ruleId, ruleName,
                      sourceConfig={ columnName, columnDatatype, aggregationFunctionName [, dateFormat] },
                      targetConfig={ columnName, columnDatatype, aggregationFunctionName [, dateFormat] },
                      sourceAlias, targetAlias, checkExpression)
            → publishes

Case B — FILE (source) vs DATABASE (target):
  Step 1  Resolve workspaceId, file connectionId, DB connectionId, folderId
  Step 2  list_files(workspaceId, fileConnectionId) → user picks source fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Checksum", connectionType="source", fileName)
            → returns: ruleId (draft) + columns with sample data
  Step 3a [flat-file only] Delimiter check: if only 1 column returned or names contain separator chars,
            read data rows to detect real delimiter (`,` `|` `\t` `;`) and re-call with
            additionalConfigs={ columnDelimiter: "<correct>" } before continuing
  Step 3b [flat-file only] Inspect corrected columns → suggest column + function → ask user to confirm
            (see FLAT-FILE AGGREGATION SELECTION above)
  Step 4  User confirms DB target: schemaName + tableName (table mode) OR sql (SQL mode)
  Step 5  Ask user for ruleName and confirm check expression / tolerance
  Step 6  update_rule(workspaceId, ruleId, ruleName,
                      sourceConfig={ columnName, columnDatatype, aggregationFunctionName [, dateFormat] },  ← flat-file only
                      targetConfig={ connectionId:<db>, schemaName, tableName } OR { connectionId:<db>, sql },
                      sourceAlias, targetAlias, checkExpression)
            → wires DB target and publishes

Case C — DATABASE (source) vs FILE (target):
  Step 1  Resolve workspaceId, DB connectionId, file connectionId, folderId
  Step 2  list_files(workspaceId, fileConnectionId) → user picks target fileName
  Step 3  fetch_file_sample_data(workspaceId, connectionId=<file>, ruleId=null, folderId,
                                 ruleType="Checksum", connectionType="target", fileName)
            → returns: ruleId (draft) + columns with sample data
  Step 3a [flat-file only] Delimiter check: if only 1 column returned or names contain separator chars,
            read data rows to detect real delimiter (`,` `|` `\t` `;`) and re-call with
            additionalConfigs={ columnDelimiter: "<correct>" } before continuing
  Step 3b [flat-file only] Inspect corrected columns → suggest column + function → ask user to confirm
            (see FLAT-FILE AGGREGATION SELECTION above)
  Step 4  User confirms DB source: schemaName + tableName (table mode) OR sql (SQL mode)
  Step 5  Ask user for ruleName and confirm check expression / tolerance
  Step 6  update_rule(workspaceId, ruleId, ruleName,
                      sourceConfig={ connectionId:<db>, schemaName, tableName } OR { connectionId:<db>, sql },
                      targetConfig={ columnName, columnDatatype, aggregationFunctionName [, dateFormat] },  ← flat-file only
                      sourceAlias, targetAlias, checkExpression)
            → wires DB source and publishes

---

FLAT-FILE AGGREGATION SELECTION (flat-file / FileStatic only — NOT flat-file-sql):

This step is REQUIRED whenever the source OR target is a flat-file (FileStatic) connection.
After fetch_file_sample_data returns, inspect the `columns` array in the response.

⚠️ IMPORTANT — FLAT-FILE DATATYPE IS ALWAYS "Text" BY DEFAULT:
In flat-file (FileStatic) connections, every column is reported as datatype "Text" regardless of the actual values.
You MUST inspect the `data` rows returned by fetch_file_sample_data to determine the real datatype from the values.
Do NOT blindly pass columnDatatype: "Text" — read the sample values and infer the actual type.

HOW TO DETERMINE ACTUAL DATATYPE FROM SAMPLE DATA:
- Look at the `data` array returned by fetch_file_sample_data — each row shows real values for each column.
- If the values are purely numeric (e.g., "12345", "99.50", "1000") → columnDatatype: "Numeric"
- If the values match a date pattern (e.g., "2024-01-15", "15/01/2024") → columnDatatype: "Date"
- If the values match a datetime pattern (e.g., "2024-01-15 10:30:00") → columnDatatype: "Datetime"
- If the values are mixed or truly text → columnDatatype: "Text"
- When uncertain, present the sample values to the user and ask them to confirm the type.

STEP: Suggest column + function to the user
1. From the returned columns, inspect sample data values to determine the ACTUAL datatype (not the reported "Text"):
   - Actual Numeric columns → all functions supported: COUNT, MIN, MAX, AVG, SUM, DISTINCTCOUNT
   - Actual Text columns → COUNT and DISTINCTCOUNT only
   - Actual Date / Datetime columns → COUNT and DISTINCTCOUNT only (MIN/MAX/AVG/SUM not supported for date)
2. Present the column list with their ACTUAL datatypes (inferred from sample values). Suggest the most appropriate column (e.g., a numeric ID for COUNT, an amount column for SUM).
3. Ask the user: "Which column should be aggregated, and which function (COUNT / MIN / MAX / AVG / SUM / DISTINCTCOUNT)?"
4. If the column is Date or Datetime, also ask: "What is the date format? (e.g., yyyy-MM-dd)"

Supported aggregation functions: ["COUNT", "MIN", "MAX", "AVG", "SUM", "DISTINCTCOUNT"]

Datatype rules (pass the ACTUAL type, not the reported "Text"):
- Numeric values (integers, decimals, amounts) → columnDatatype: "Numeric"
- Text / string values → columnDatatype: "Text"
- Date values → columnDatatype: "Date"
- Datetime / timestamp values → columnDatatype: "Datetime"

Output datatype per function (what the aggregation result will be):
- SUM, AVG → always "Numeric" (regardless of input type)
- COUNT, DISTINCTCOUNT, MIN, MAX → same as columnDatatype you pass in

STEP: Call update_rule with the selected column
Pass these ADDITIONAL params in sourceConfig (for flat-file source) or targetConfig (for flat-file target):
- columnName: the selected column name
- columnDatatype: "Numeric" | "Text" | "Date" | "Datetime"
- aggregationFunctionName: the selected function (e.g., "COUNT")
- dateFormat: only required when columnDatatype is "Date" or "Datetime" (e.g., "yyyy-MM-dd")

Example update_rule call for a flat-file source:
  update_rule(workspaceId, ruleId, ruleName,
              sourceConfig={ columnName: "customer_id", columnDatatype: "Numeric", aggregationFunctionName: "COUNT" },
              targetConfig={ connectionId: <db>, schemaName, tableName },
              sourceAlias: "SOURCE_COUNT", targetAlias: "TARGET_COUNT",
              checkExpression: "S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0")

KEY RULES:
- Do NOT skip the column/function selection step for flat-file connections — update_rule will throw an error if columnName, aggregationFunctionName, and columnDatatype are missing for a FileStatic source or target.
- This step is NOT needed for flat-file-sql, parquet, excel, json, or xml — those use SQL-based COUNT(*) automatically.

---

KEY RULES for file connections:
- Do NOT call analyze_recon_mapping for checksum rules — there are no join keys or column checks
- Never call update_rule with both sourceConfig and targetConfig for file+DB rules — update only the DB side
- sourceAlias and targetAlias must be different from each other

ERROR RECOVERY for file rules:
- "fileSchemaId missing" → re-call fetch_file_sample_data with the existing ruleId and correct connectionType
- "Dataset has no connectionId" → re-run fetch_file_sample_data with ruleId
- Do NOT call update_rule until fetch_file_sample_data confirms success

---

CHECK EXPRESSION PATTERN (TRUE = PASS):
- Default: S.[SOURCE_COUNT] - T.[TARGET_COUNT] == 0 > pass when counts match exactly
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
