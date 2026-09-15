# API connection notes — REST API testing mechanics

Operationally necessary detail for designing checks against a REST API connection. Illustrative
only — `get_guidance('create_api_validation_rules')` / `get_guidance('create_api_recon_rules')` is
authoritative for this server version; where they differ, `get_guidance` wins.

## Contents
- Connection identification and prerequisites
- The two-phase registration flow
- apiConfig field cheat sheet
- Response shape / jsonPath check
- Pagination — preview vs full execution
- api-validation vs api-recon — which path, and how the target gets wired
- Rule-type support boundary
- Status/response-code checks as a signal
- JSON has no native DATE/DECIMAL type

## Connection identification and prerequisites

API connections are System Connections (per `list_connections`, valid `type` filter value "REST
API connections"; `connectorType="apidb"`). Supported auth mechanisms are **connection-level**, not
something this skill configures: API Key, Basic, Bearer Token, No Auth, OAuth. This skill's job
stops at confirming the connection exists and is ACTIVE (`list_connections`) and reachable
(`test_connection`) — never attempt to create, edit, or repair a connection; that is the
customer's admin's job in the Connectors section of the iceDQ UI.

## The two-phase registration flow

`fetch_api_sample_data` is the API analogue of `fetch_file_sample_data`:
- **Phase 1** (this skill, during analysis): registers the API's schema and creates a **draft**
  rule. Returns `ruleId`, `columns`, sample `data`, `fileSchemaId`, `baseUrl`, `jsonPath`.
- **Phase 2** (`icedq-author-rules` Build mode, at creation time): `update_rule` adds the approved
  checks (and, for Recon, join keys / target wiring) and publishes.

Carry the Phase 1 `ruleId` in the spec as `existingDraftRuleId` — Build mode completes that draft,
it does not create a new rule.

## apiConfig field cheat sheet

| Field | Notes |
|---|---|
| `endPoint`, `tableName` | Always required. `tableName` is the friendly dataset label. |
| `requestMethod` | `GET` (default) or `POST`. |
| `headers` / `params` | Array of `{key, value, description}`. |
| `requestBody` | POST only: `{type: JSON\|XML\|TEXT, payload}`. |
| `pagination` | `{enablePaging, type: "Limit Offset"\|"Page Number"\|"Cursor", properties: {...}}`. |
| `dataModel` | `FlattenedDocuments` (default, tabular-shaped rows/columns) or `Document` (raw nested). |
| `jsonPath` | Auto-inferred; override when the response wraps the array (see below). |

**Ask once, not field-by-field:** collect `endPoint`/`tableName` first, then a single follow-up
covering method, headers, params, body, and pagination together — this mirrors the tool's own
guidance and avoids a wall of one-question-at-a-time prompts.

## Response shape / jsonPath check

Inspect the `columns` array returned by Phase 1 immediately, the same discipline as the file
producers' delimiter check:
- Only 1 column, or column names that look like a wrapper key (`"data"`, `"results"`, `"items"`,
  `"records"`) rather than real fields → the array is nested inside an envelope object.
- Read the raw `data` rows to find the true array path, then re-call
  `fetch_api_sample_data(..., apiConfig: {jsonPath: "<correct path>"})` before designing any check.

## Pagination — preview vs full execution

`fetch_api_sample_data`'s `sampleRows` (default 10) is a **preview only**. If the endpoint
paginates, the executed rule must carry `apiConfig.pagination` in the spec, or a validation/recon
rule that runs for real will only ever see page one — this looks like a false "clean" result, not
an obvious error. Confirm pagination type and its parameters (`pageSize`, `pageNumberParam`,
`pageOffsetParam`, `pageTokenParam`, `pageTokenPath`, `hasMorePath`, `pageUrlPath`) with the
customer during Step 1's consolidated follow-up, not as an afterthought at spec time.

## api-validation vs api-recon — which path, and how the target gets wired

- **Single API dataset, self-validation** → `ruleType='api-validation'`. One `fetch_api_sample_data`
  call.
- **API vs API reconciliation** → `ruleType='api-recon'`, `connectionType='source'` first, then a
  second `fetch_api_sample_data(ruleId=<from first call>, connectionType='target', apiConfig=...)`
  to wire the target API side onto the same draft.
- **API vs database reconciliation** → `ruleType='api-recon'`, `connectionType='source'` only. The
  database side is resolved the normal way (`list_connection_metadata`/`fetch_db_sample_data`) and
  wired into the draft by Build mode via `update_rule`'s `targetConfig` (`connectionId` +
  `sql` or `schemaName`/`tableName`) — the standard "blank dataset wiring" `update_rule` already
  supports for any database target. No second `fetch_api_sample_data` call is needed or possible
  for a non-API target.

## Rule-type support boundary

Only Validation (`api-validation`) and Recon (`api-recon`) have a dedicated tool-and-guidance path
for a raw API dataset (`fetch_api_sample_data` + matching `get_guidance` topics). There is no
`create_api_duplicate_rule`/`create_api_checksum_rule`/`create_api_pushdown_rule`. If the check plan
calls for uniqueness, an aggregate compare, or a threshold directly against the API data, call
`get_guidance` for the relevant topic first to confirm whether this server version supports
targeting the registered API draft table with the generic tool — do not assume it does. If it
doesn't, express the same intent as a Custom check inside a Recon (e.g. an aggregate comparison
computed client-side across the fetched rows) or ask the customer whether the API pull can land in
a table first.

## Status/response-code checks as a signal

A "status code" requirement usually means a field in the flattened response body (not the raw HTTP
status of the fetch itself) — e.g. an `orderStatus`/`responseCode` column. Model it as:
- A fixed, known set → ValidValues.
- A numeric range (e.g. HTTP-style codes embedded in payload) → Custom:
  `S.[code]>=200 && S.[code]<300`.

## JSON has no native DATE/DECIMAL type

Timestamps arrive as ISO-8601 strings or epoch numbers; numbers arrive as JSON numbers (not
BigDecimal). Before writing any date or arithmetic Custom expression: confirm the actual shape via
`profile_data`/inspecting sample values, then follow the TEXT-stored-date and numeric-conversion
recipes in `references/groovy-recipes.md`. Never assume a `Date` checkType applies without
confirming the string format first.
