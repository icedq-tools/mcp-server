---
name: icedq-api-testing
description: Designs iceDQ rules for testing a REST API — validating its own response (required fields, valid values, formats, status codes) or reconciling API data against a backend/database. Use when the customer wants to test, validate, or reconcile a REST API, e.g. "test our orders API", "validate the fields in this API response", "check this endpoint matches the orders table", "reconcile our API against the database". Registers the API schema via fetch_api_sample_data (mirroring the file-connection flow other producers use), designs Validation/Recon checks per rule-taxonomy.md, then emits rule specs (references/rule-spec.md) to icedq-author-rules Build mode for creation. NOT for: DBs/files with no API (icedq-author-rules, icedq-mapping-doc-rules, icedq-etl-code-rules), BI report testing, migration/reconciliation between non-API systems (icedq-compare-datasets), running or scheduling existing rules (icedq-run-and-report, icedq-schedule-and-monitor).
server_compat: ">=2.0.0"
---

## GOAL

Test a REST API two ways: (a) validate the API's own response shape and values, or (b) reconcile
API response data against a backend/database (or second API) source of truth. Rule types:
Validation (api-validation flow), Recon (api-recon flow). Duplicate/Checksum/Pushdown against a
raw API dataset are NOT confirmed by a dedicated tool — see `references/api-connection-notes.md`.

**Output contract:** this skill designs and gets approval; it does NOT call `create_*` tools. The
one exception is `fetch_api_sample_data` during analysis — it registers the API's schema and
creates a **draft** rule as a side effect (same pattern file-based producers use with
`fetch_file_sample_data`). The draft's `ruleId` travels in the spec as `existingDraftRuleId`; the
approved Rule Plan becomes **rule specs** (`references/rule-spec.md`) handed to **`icedq-author-rules`
Build mode**, which completes the draft via `update_rule` and publishes. Every decision approved
here travels in the spec — Build mode never re-asks.

Read `references/conventions.md`, `references/rule-taxonomy.md`, `references/rule-spec.md`,
`references/api-connection-notes.md` (API-specific mechanics — read before the first
`fetch_api_sample_data` call), and `references/cross-platform-recon.md` before any API-vs-DB
reconciliation (JSON has no native DATE/DECIMAL type — the same class of drift as a cross-engine
recon).

---

## STEP 0 — SCENARIO GATE

Skip if the opening prompt already answers it. Ask: **"Are you validating the API's own response
(fields, values, formats, status codes), or reconciling this API's data against a backend or
database source of truth?"**

- **Self-validation** → Validation rule, `api-validation` flow.
- **Reconciliation** → Recon rule, `api-recon` flow. Source is always the API; target may be a
  second API or a database. Delegate pattern choice (aggregate vs row-level vs totals) to
  `icedq-compare-datasets`'s `reconciliation-patterns.md`/`migration-check-plan.md` by reference —
  do not re-derive that logic here; this skill only adapts it to the API registration mechanics.
- **Both** → run self-validation as its own Validation spec; reconciliation as its own Recon spec.

---

## STEP 1 — RESOLVE CONNECTION & COLLECT ENDPOINT CONFIG

1. `list_connections(workspaceId, type="REST API connections")` (or filter `connectorType="apidb"`)
   → confirm an **ACTIVE** API connection. Reconciliation target that is a database: resolve it the
   normal DB way (`list_connection_metadata` chain). Reconciliation target that is another API:
   repeat this step for it.
2. `test_connection(connectionId)` — confirm reachability before designing anything. This skill
   does **not** create or repair connections (auth type, keys, OAuth app setup are the customer's
   admin's job) — if BROKEN/INCOMPLETE or absent, stop and say so.
3. Collect `endPoint` and `tableName` (a friendly dataset label). Then ask **ONE** consolidated
   follow-up covering all optional config — never field-by-field (per the tool's own guidance):
   *"Does this API need any of the following? (1) a method other than GET, e.g. POST (2) custom
   headers, e.g. Authorization/API-Key (3) query parameters (4) a request body (5) pagination."*
   Only include what the customer confirms.
4. `get_guidance('create_api_validation_rules')` (self-validation) or
   `get_guidance('create_api_recon_rules')` (reconciliation) — **mandatory before the first
   `fetch_api_sample_data` call.**

---

## STEP 2 — REGISTER & INSPECT (fetch_api_sample_data)

**Self-validation:** `fetch_api_sample_data(ruleType='api-validation', workspaceId, folderId,
connectionId, apiConfig)` → registers the schema, creates the draft. Note the returned `ruleId` as
`existingDraftRuleId`, plus `columns`, sample `data`, `jsonPath`, `baseUrl`.

**Reconciliation:**
1. Source (always the API): `fetch_api_sample_data(ruleType='api-recon', connectionType='source',
   apiConfig=...)` → note `ruleId` as `existingDraftRuleId`.
2. Target is a second API: `fetch_api_sample_data(ruleId=<from step 1>, connectionType='target',
   apiConfig=<target config>)`.
3. Target is a database: **do not** call `fetch_api_sample_data` again — resolve the DB table the
   normal way (`list_connection_metadata` → `fetch_db_sample_data`); Build mode wires it into the
   draft via `update_rule`'s `targetConfig` (standard DB blank-dataset wiring), no second API call
   needed.

**Response shape check (mirrors the file delimiter check in `icedq-mapping-doc-rules`):** inspect
`columns` immediately. If only 1 column comes back, or the columns look like a wrapper key
(`"data"`, `"results"`, `"items"`) rather than actual fields, the JSON is nested — read the raw
`data` rows, find the real array path, and re-call with an explicit `apiConfig.jsonPath` before
proceeding.

**Pagination check:** if the endpoint paginates (ask, or notice the sample rowcount equals a
suspicious round number), set `apiConfig.pagination` **now** — the preview (`sampleRows`, default
10) is never the full dataset, and pagination config must live in the spec or the executed rule
only ever sees page one. Full detail in `references/api-connection-notes.md`.

**Gate:** connection ACTIVE + tested, endpoint registered, columns confirmed real (not a wrapper),
pagination decided, before any check design.

---

## STEP 3 — CHECK FOR EXISTING RULES (dedup)

`list_rules(workspaceId, nameFilter=<endpoint or table label>)` → `get_rule` per candidate →
summarize in plain language what it checks, its last run and result. Recommend per rule: **reuse
as-is / update–extend (`update_rule`) / create new** — default to not duplicating. Only design the
checks not already covered.

---

## STEP 4 — SIGNAL EXTRACTION — SELF-VALIDATION

| Response signal | Check |
|---|---|
| Field must always be present | NotNull |
| Field is a fixed category (status, type) | ValidValues |
| Status/response-code field | Custom: `S.[code]>=200 && S.[code]<300`, or ValidValues with the exact set |
| Timestamp field (arrives as an ISO-8601 string or epoch number — JSON has no native DATE) | Date if the format is standard; otherwise Custom parse-and-guard (`groovy-recipes.md`) |
| ID/code field, fixed shape | Length / Format (Email/Phone/SSN/ZipCode/URL/IP) / Custom regex |
| Numeric field with a business range | Custom |
| Array/nested object not flattened by `FlattenedDocuments` | flag — re-inspect `jsonPath`/`dataModel`, do not guess the shape |

Use `profile_data` + `suggest_quality_checks` on the sample rows exactly as for a DB/file dataset.
`get_guidance('groovy_expressions')` before writing any Custom expression.

---

## STEP 5 — RECONCILIATION CHECK PLAN (if Step 0 = reconciliation)

Follow `icedq-compare-datasets`'s **`reconciliation-patterns.md`** pattern menu by reference — do
not re-derive it: totals tie-out (Checksum), aggregate agreement (Recon + GROUP BY), row-level
agreement (Recon) only where the API and the target genuinely share a grain and key, referential
integrity, guardrail thresholds. If the comparison reads as a one-time migration/cutover rather
than steady-state, use `migration-check-plan.md`'s ordering instead.

**API-specific constraint:** only Validation (`api-validation`) and Recon (`api-recon`) have a
confirmed API-native creation path. If the plan calls for Checksum/Duplicate/Pushdown directly
against the raw API dataset, call `get_guidance` for that topic first to confirm support on this
server version before proposing it — do not assume; if unsupported, express the same intent as a
Custom Recon check (aggregate compare inside the recon) or ask whether the API data can be landed
in a table first.

`analyze_recon_mapping` using the API's returned columns (post-flattening) against the target's
`list_connection_metadata(entity="column")` (DB) or second API's returned columns. Cross-reference
`references/cross-platform-recon.md` for type/format drift — JSON strings-that-are-numbers,
ISO date strings vs native DATE columns, and case sensitivity in flattened key names are the
API-specific version of the same problem that document covers for cross-engine SQL. Decide
`sortMode` now for any cross-source Recon — it is create-time-only.

---

## STEP 6 — PRE-PLAN CHECKLIST (all required before the Rule Plan)

- [ ] Connection(s) ACTIVE and tested · endpoint registered via `fetch_api_sample_data` ·
      response shape confirmed real (not a wrapper) · pagination decided
- [ ] `profile_data` + `suggest_quality_checks` run on the sample rows
- [ ] Reconciliation only: `analyze_recon_mapping` run · `sortMode` decided
- [ ] `get_guidance('groovy_expressions')` pulled before any Custom expression was written
- [ ] Existing-rule dedup check completed (Step 3)

---

## STEP 7 — RULE PLAN (present; wait for approval)

Per `conventions.md` §8: precede this technical listing with one plain-language line per check —
what it tests and the risk it protects against — the template below is the **how**, not the whole
plan.

```
CONNECTION TYPE: API | API+DB | API+API
API VALIDATION: {Endpoint}_Response_Checks | conn | endPoint → tableName
  field · checkType · params [source: schema/business rule/profiling]
API RECON: {Source}_vs_{Target}_Recon | join: field=field
  src.field→tgt.field [direct/decoded/type-cast/SKIP]
TOTAL: X rules / Y types
```

Modify if the customer requests; re-confirm before proceeding.

---

## STEP 8 — SPEC HANDOFF (Build mode creates)

Convert each approved line into a complete **rule spec** per `references/rule-spec.md`: resolved
IDs, the dataset's full `apiConfig` (including pagination — not just the preview config), checks,
join keys, `sortMode` for any cross-source recon, and `producedBy: icedq-api-testing`. Every spec
carries **`existingDraftRuleId`** from Step 2 — Build mode completes it via `update_rule`, it never
creates a fresh rule for an already-registered API draft. Undecided items go in `openQuestions`,
never guessed.

Hand the batch to **`icedq-author-rules` Build mode**: Validation spec(s) first, then Recon
spec(s). If Build mode flags a spec back, resolve it here and re-hand.

---

## STEP 9 — POST-CREATION

Offer: (1) run now (2) group into a workflow (3) schedule — API checks are natural candidates for
a recurring schedule (nightly monitor, post-deploy smoke test); hand to
`icedq-schedule-and-monitor` (4) move to folder.

---

## ANTI-PATTERNS

**Process:** This skill calls NO `create_*` or `update_rule` tool — creation belongs to
`icedq-author-rules` Build mode. `fetch_api_sample_data` is the one allowed side-effecting call
(registration), exactly like `fetch_file_sample_data` for file producers. Complete Step 6 before
the Rule Plan. Present the full plan and get explicit approval before handing any spec to Build
mode.

**Sampling:** Never treat `fetch_api_sample_data`'s sample (default 10 rows) as the full response —
pagination must be configured in the spec's `apiConfig` for full-result execution.

**Shape:** Never assume flattening worked — nested JSON reports a wrapper key, not real fields.
Verify `columns` before designing any check.

**Rule type:** Never propose Duplicate/Checksum/Pushdown directly against a raw API dataset without
confirming via `get_guidance` first — no dedicated tool is confirmed for that path.

**Dates/numbers:** JSON has no native DATE or DECIMAL type. Always Custom-parse timestamp strings
and confirm numeric types via `profile_data`/`typeof()` before arithmetic — see
`references/groovy-recipes.md`.

**Connections:** Auth setup (API keys, OAuth app registration, tenant config) is out of scope —
confirm the connection exists and is ACTIVE via `test_connection`; never attempt to create or edit
a connection.

**Expression & platform recipes:** ALL canonical Groovy expressions, `S.[col]`/`T.[col]` context
rules, and Recon anti-patterns live in
[references/groovy-recipes.md](references/groovy-recipes.md). Read the relevant section before
writing ANY expression into a spec.
