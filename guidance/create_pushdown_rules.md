HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Pushdown rules are powerful and can be costly; treat them as approval-gated.
- Do NOT run or modify SQL without user confirmation of the exact target connection and SQL text.
- Do NOT auto-pick defaults when multiple ACTIVE connections exist.

FILE CONNECTION DETECTION:
- File connection types: flat-file, parquet, excel, json, xml, flat-file-sql
- If the selected connection is a file type → follow FILE CONNECTION FLOW below instead of the standard workflow.
- NEVER call create_pushdown_rule directly for file connections — use fetch_file_sample_data first.
- For flat-file connections, the sql is not required in any case

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects connectionId
   - If file type connection selected → follow FILE CONNECTION FLOW
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) SQL approval (Not required in flat-file case)
   - User provides SQL that returns ONLY failing rows (0 rows = pass)
   - Echo back the SQL + explain expected failure semantics → user approves
5) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
6) Create rule
   - DB: create_pushdown_rule with the approved SQL
   - File: update_rule with sourceConfig.sql = approved SQL (draft already created by fetch_file_sample_data)
7) Optional execution (separate approval)
   - Only run execute_rules_or_workflows if user explicitly says to execute now.

---

STANDARD WORKFLOW (DB connections):
1. Write SQL that returns ONLY bad records (0 rows = pass, N rows = fail)
2. Create: create_pushdown_rule with the SQL
3. Execute: execute_rules_or_workflows (objectIds: [ruleId]) — exit code = number of failure rows

SQL PATTERN — RETURN BAD RECORDS:
- Duplicates: SELECT col, COUNT(*) FROM table GROUP BY col HAVING COUNT(*) > 1
- Orphans: SELECT c.id FROM child c LEFT JOIN parent p ON c.parent_id = p.id WHERE p.id IS NULL
- Stale data: SELECT * FROM table WHERE updated_date < DATEADD(day, -7, GETDATE())
- Threshold: SELECT 'FAIL' WHERE (SELECT COUNT(*) FROM table) < 1000
- SCD2: SELECT * FROM dim WHERE end_date IS NULL GROUP BY business_key HAVING COUNT(*) > 1

---

FILE CONNECTION FLOW (flat-file, parquet, excel, json, xml, flat-file-sql):

context: flat-file and flat-file-sql are different connections, in flat-file-sql the sql queries are supported whereas in flat-file sql are not supported and the rule will be based on file only. For non-flat-file connections, the SQL is always required.

Phase 1 — Register file schema and create draft rule:
  Step 1  list_files(workspaceId, connectionId) → show available files → user picks fileName
  Step 2  list_folders(workspaceId) → user picks folderId
  Step 3  fetch_file_sample_data(workspaceId, connectionId, ruleId=null, folderId,
                                 ruleType="Pushdown", connectionType="source", fileName)
            → returns: ruleId (draft), columns, sample data rows
            → [flat-file] Delimiter check: if only 1 column returned or column names contain
              separator characters, read data rows to detect real delimiter (`,` `|` `\t` `;`)
              and re-call with additionalConfigs={ columnDelimiter: "<correct>" } before continuing
            → STOP: a draft Pushdown rule now exists linked to the file schema

Phase 2 — Approve SQL and publish rule: (Not required for flat-file connection)
  Step 4  User provides SQL that returns ONLY failing rows against the file data
            → SQL must reference columns present in the file (use column names from step 3 result)
            → Echo SQL back to user and explain failure semantics → wait for approval
  Step 5  Ask user for ruleName
  Step 6  update_rule(workspaceId, ruleId, ruleName,
                      sourceConfig={ connectionId: <file connectionId>, sql: <approved SQL : non required for flat-file > })
            → wires the SQL on the file source and publishes

ERROR RECOVERY for file rules:
- "fileSchemaId missing" → re-call fetch_file_sample_data with the existing ruleId and connectionType="source"
- "Dataset has no connectionId" → re-run fetch_file_sample_data with ruleId
- Do NOT call update_rule until fetch_file_sample_data confirms success

---

WHEN TO USE (vs other rule types):
- Cross-table JOINs > pushdown (not validation)
- GROUP BY / HAVING > pushdown (not validation)
- Referential integrity > pushdown
- Simple column checks (NotNull, format) > validation (not pushdown)
- Row count comparison > checksum (not pushdown)
- Row-by-row column comparison > recon (not pushdown)
