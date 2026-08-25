HUMAN-IN-THE-LOOP (RECOMMENDED DEFAULT):
- This workflow is intended to be approval-gated. If the user does NOT provide explicit IDs/names for each choice, you MUST stop and ask.
- Do NOT auto-pick defaults when multiple options exist.

API CONNECTION DETECTION:
- API connection type: apidb (REST API endpoints)
- API connections require special handling similar to file connections
- NEVER call create_validation_rule directly for API connections — use API CONNECTION FLOW below

APPROVAL GATES (do these in order and WAIT after each):
1) Workspace selection
   - list_workspaces → present options → user selects workspaceId
2) Connection selection
   - list_connections(workspaceId, connectorType="apidb") → user selects connectionId
   - IMPORTANT: Always filter for connectorType="apidb" to show only API connections
3) Folder selection
   - list_folders(workspaceId, optional nameFilter) → user selects folderId
   - If folder does not exist: call get_guidance('rule_organization'), propose folderName + parent folder, then ONLY create_folder after user approves
4) API configuration
   - endPoint: User provides API path (e.g., "/products", "/api/v1/users") or null for root
   - requestMethod: GET (default) | POST (ONLY GET and POST are supported for API validation rules)
   - dataModel: "Document" (flat) | "FlattenedDocuments" (nested, recommended)
   - tableName: User provides descriptive name (e.g., "products_catalog", "user_profiles")
   - jsonPath: ONLY if dataModel="FlattenedDocuments" AND data is nested (e.g., "$.data.items", "$.results") — leave empty for root level
   - AUTO-INFER: for FlattenedDocuments + single-segment endpoints (e.g. "/products"), MCP auto-uses "$.products"
   - baseUrl: auto-resolved from connection metadata when possible; pass explicitly if connection has no stored URL
5) Sample data verification
   - Show preview: columns and first 5 rows
   - User confirms: "Does this look correct?"
6) Checks approval
   - Present suggested checks and WAIT for user approval (include/exclude/modify)
7) Rule name approval
   - Ask user for ruleName. Do NOT auto-generate
8) Publish rule
   - Apply approved checks and publish
9) Optional execution (separate approval)
   - Only run execute_rules_or_workflows if user explicitly says to execute now

---

API CONNECTION FLOW:

NOTE ON RULE TYPE PARAMETER:
- For API validation rules, ONLY "api-validation" is supported (lowercase)
- The system will validate and reject any other format

Phase 1 — Register API schema and create draft rule:
  Step 1  Resolve workspaceId, connectionId (apidb type), folderId
  Step 2  Gather API configuration from user (approval gate #4):
            - endPoint (required, can be null for root)
            - requestMethod (default: GET)
            - dataModel: Document | FlattenedDocuments
            - tableName (required)
            - jsonPath (conditional: only if FlattenedDocuments + nested data)
  Step 3  Internal: fetchApiFileSampleData(workspaceId, connectionId, ruleId=null, folderId,
                                           ruleType="api-validation", connectionType="source",
                                           apiConfig={ baseUrl, endPoint, requestMethod, tableName, dataModel, jsonPath, ... })
            → returns: ruleId (draft), columns, sample data rows, fileSchemaId
            → STOP: a draft Validation rule now exists linked to the API schema

Phase 2 — Profile, approve checks, and publish:
  Step 4  Show sample data preview → user verifies columns and data structure
  Step 5  profile_data(sampleData) → suggest_quality_checks(profileData)
            → present suggested checks to user → wait for approval
  Step 6  Ask user for ruleName
  Step 7  update_rule(workspaceId, ruleId, ruleName, checksToAdd=[...approved checks...])
            → publishes the rule

---

DATA MODEL SELECTION:

Document:
- Use for flat, simple JSON responses
- Nested objects/arrays remain as JSON text columns
- Example: { "id": 1, "name": "Product A", "price": 99.99 }

FlattenedDocuments:
- Use for nested JSON structures
- Automatically flattens nested objects into dot-notation columns (e.g., category.id, category.name)
- Arrays expand into separate rows (one row per array item)
- Requires jsonPath if data is nested under keys (e.g., $.data.items)

JSONPath examples:
- $.data           → data nested under 'data' key
- $.results        → results array at root
- $.data.items     → items nested two levels deep
- (empty/null)     → use root level data

---

GROOVY EXPRESSION PATTERN (Custom checks):
- All custom checks use TRUE = PASS, FALSE = FAIL
- Write expressions that describe VALID data conditions
- Examples:
  S.[id] != null                                     > ID required
  S.[price] > 0                                      > price must be positive
  S.[email] != null && S.[email].contains("@")       > email must contain @
  S.[status] in ["Active","Pending","Completed"]     > status must be valid
  S.[category.id] != null                            > nested field required (FlattenedDocuments)
  S.[updatedAt] >= S.[createdAt]                     > dates in order

SUPPORTED CHECK TYPES:
- NotNull: {checkType: "NotNull", column: "col"}
- ValidValues: {checkType: "ValidValues", column: "col", expectedValues: ["A","B"]}
- Format: {checkType: "Format", column: "col", pattern: "Email|Phone|SSN|ZipCode|URL|IP"}
- Length: {checkType: "Length", column: "col", expectedLength: 10, operator: "equal to"}
- Date: {checkType: "Date", column: "col", dateFormat: "yyyy-MM-dd"}
- Custom: {checkType: "Custom", column: "col", expression: "S.[col] > 0"}

FAST PATH (when user provides all values in one message):
- If workspace, connection, folder, endpoint, method, tableName, ruleName, and check approval are all given upfront:
  1) fetch_api_sample_data (single call — registers schema, creates draft, returns sample)
  2) update_rule with checksToAdd + ruleName (publish)
- Skip redundant approval gates when user explicitly says "use defaults" or "approve all checks"

ERROR RECOVERY:
- "No columns returned" or "Empty data" → verify endpoint path, try different jsonPath ($.data, $.results, or empty), or switch dataModel
- "baseUrl is required" → pass apiConfig.baseUrl explicitly or fix connection URL in iceDQ UI
- HTTP 500 on new rule creation → ensure MCP server is up to date (rule payload must include RecordCheck with ResultType)
- "Schema not found" or "fileSchemaId missing" → re-call fetchApiFileSampleData with same parameters
- "Rule already exists" → call get_rule to find existing, then use update_rule with existing ruleId
- "Invalid dataModel" → must be "Document" or "FlattenedDocuments" (case-sensitive)
- Columns look wrong → adjust jsonPath or switch dataModel

ANTI-PATTERNS:
- Do NOT call create_validation_rule for API connections — use fetchApiFileSampleData + update_rule
- Do NOT skip API configuration approval — always confirm endpoint, dataModel, tableName with user
- Do NOT create separate rules per check — combine into ONE rule per endpoint
- Do NOT auto-execute without approval — always ask first

NOTES:
- API connections handle pagination via connection configuration (not in rule)
- Nested field columns use dot notation: S.[category.name], S.[address.zipCode]
- Use brackets in expressions for all column names: S.[columnName]
- Consider rate limits when scheduling API rule execution
