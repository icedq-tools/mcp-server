HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Pushdown rules are powerful and can be costly; treat them as approval-gated.
- Do NOT run or modify SQL without user confirmation of the exact target connection and SQL text.
- Do NOT auto-pick defaults when multiple ACTIVE connections exist.

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Connection selection
   - list_connections(workspaceId) → show ACTIVE only → user selects connectionId
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
4) SQL approval (required)
   - User provides SQL that returns ONLY failing rows (0 rows = pass)
   - Echo back the SQL + explain expected failure semantics → user approves
5) Rule name approval
   - Ask the user for ruleName. Do NOT auto-generate.
6) Create rule
   - create_pushdown_rule with the approved SQL
7) Optional execution (separate approval)
   - Only run execute_rule if user explicitly says to execute now.

WORKFLOW:
1. Write SQL that returns ONLY bad records (0 rows = pass, N rows = fail)
2. Create: create_pushdown_rule with the SQL
3. Execute: execute_rule — exit code = number of failure rows

SQL PATTERN — RETURN BAD RECORDS:
- Duplicates: SELECT col, COUNT(*) FROM table GROUP BY col HAVING COUNT(*) > 1
- Orphans: SELECT c.id FROM child c LEFT JOIN parent p ON c.parent_id = p.id WHERE p.id IS NULL
- Stale data: SELECT * FROM table WHERE updated_date < DATEADD(day, -7, GETDATE())
- Threshold: SELECT 'FAIL' WHERE (SELECT COUNT(*) FROM table) < 1000
- SCD2: SELECT * FROM dim WHERE end_date IS NULL GROUP BY business_key HAVING COUNT(*) > 1

WHEN TO USE (vs other rule types):
- Cross-table JOINs > pushdown (not validation)
- GROUP BY / HAVING > pushdown (not validation)
- Referential integrity > pushdown
- Simple column checks (NotNull, format) > validation (not pushdown)
- Row count comparison > checksum (not pushdown)
- Row-by-row column comparison > recon (not pushdown)
