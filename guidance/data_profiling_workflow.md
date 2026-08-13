HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- Profiling should only run AFTER the user has confirmed the exact workspace + connection + table (or customSql).
- If multiple choices exist (workspaces, connections, folders, schemas, tables), present options and WAIT for the user to select.
- Before executing any SQL-based sampling, confirm the target (database/schema/table or customSql) with the user.

PROFILING WORKFLOW:
1. fetch_sample_data: Get sample rows from table
   - Azure SQL: Use databaseName="" (empty string), not actual database name
   - Standard mode: schemaName + tableName
   - Custom SQL mode: customSql for filtered/joined data
2. profile_data: Pass the data array from fetch_sample_data response
   - Returns per-column: nullCount, nullPercentage, uniqueCount, dataType, isPotentialKey
3. suggest_quality_checks: Pass the profile output
   - Returns suggested checks with priority (high/medium/low)
   - Clean data (zero nulls) returns empty suggestions — this is expected

APPROVAL GATE (required before rule creation):
- Always present the suggested checks to the user and WAIT for approval (include/exclude/modify) before calling any rule-creation tool.

INTERPRETING PROFILE RESULTS:
- nullPercentage > 0: Column has missing data > NotNull check candidate
- uniqueCount == rowCount: Potential primary key > Duplicate check candidate
- uniqueCount very low: Low cardinality > ValidValues check candidate
- isPotentialKey == true: Column may be a natural key

FOR RICHER PROFILING:
- Use tables with known data issues (nulls, duplicates) for meaningful results
- Clean tables will return empty suggestions — this is correct behavior
- For column-level metadata: list_columns returns datatype, length, isPrimaryKey
