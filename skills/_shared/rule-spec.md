# iceDQ rule spec — the creation contract between skills

Every iceDQ skill that decides a rule is needed hands that decision to the **Build mode** of
`icedq-author-rules` as a **rule spec** in this format. The producer skill decides **what** to
build (including the rule type); Build mode decides **how** to build it correctly on this
customer's server version. This is the single creation path — no skill calls a `create_*_rule`
tool directly except author-rules Build mode.

Producers: `icedq-suggest-checks` (advisor plans), `icedq-compare-datasets` (comparison check
plans), `icedq-mapping-doc-rules` (mapping documents), `icedq-etl-code-rules` (ETL code), and
author-rules' own Direct mode (customer-named checks).

## Contents
- The invariant: a populated field is an approved decision
- Spec fields: Identity · Placement · Datasets · Logic (by rule type) · Comparison settings · Parameters · Confirmation & provenance
- Create-time-only settings (sortMode)
- Build mode duties
- Example — illustrative cross-platform schema-parity recon

## The invariant: a populated field is an approved decision

Every populated field in a spec has already been confirmed with the customer by the producer.
Build mode **must not re-ask** about populated fields — re-asking the same question twice is the
failure this contract exists to prevent. Build mode may only ask about:
- fields listed in `openQuestions`, and
- required fields that are genuinely blank.

Conversely, producers **must not populate a field the customer has not confirmed.** If it isn't
approved yet, leave it blank and list it in `openQuestions`.

## Spec fields

### Identity
| Field | Notes |
|---|---|
| `specVersion` | Contract version, currently `1`. |
| `producedBy` | Skill that produced the spec (provenance). |
| `ruleType` | `Validation` \| `Duplicate` \| `Recon` \| `Checksum` \| `Pushdown` \| `Script` (last resort). **Pre-decided by the producer** per `rule-taxonomy.md`. Build mode validates it but does not re-choose. |
| `ruleName` | Customer-approved name. Convention suggestions live in `rule-taxonomy.md`. |
| `description`, `purpose` | Plain-language: what it protects and why. |
| `criticality`, `dqDimension` | Optional; per customer preference. |

### Placement (resolved UUIDs — never names)
| Field | Notes |
|---|---|
| `workspaceId` | `wksc-…` from `list_workspaces`. |
| `folderId` | `fldr-…` from `list_folders` (or created via `create_folder` after approval). |

### Datasets
`source` always; `target` required for `Recon`/`Checksum`, absent for single-dataset types
(`Validation`, `Duplicate`, `Pushdown` — a Pushdown's whole logic is `source.sql`).

Per dataset: `connectionId` (`conn-…`), then **either** `databaseName`/`schemaName`/`tableName`
**or** `sql` (custom query). File datasets instead carry `connectionId` + `fileType` + `filePath`/
`fileName` — Build mode must follow the file flow in `get_guidance` (`fetch_file_sample_data`
first; never a direct `create_*_rule` call). If the producer already registered the file during
analysis (which creates a draft rule), the spec carries **`existingDraftRuleId`** — Build mode then
completes that draft via `update_rule` instead of creating a new rule.

### Logic (by rule type)
| Rule type | Spec carries |
|---|---|
| Validation | `checks[]` — each `{name, checkType: NotNull\|ValidValues\|Length\|Format\|Date\|Custom, column, …type-specific fields}`. Combine all checks for one table into ONE rule. |
| Duplicate | `duplicateColumns[]` — the business key. |
| Recon | `joinKeys[] {sourceColumn, targetColumn}`, `checks[]` (`SimpleCompare` with source/target columns, or `Custom` with expression), `resultTypes` (`a-b`, `b-a`, `Xp`), `sortMode`. |
| Checksum | Per side: `columnName` + `aggregationFunctionName` (COUNT/SUM/AVG…), plus the compare `checkExpression` (e.g. tolerance). |
| Pushdown | `source.sql` returning **only failing rows** (0 rows = pass). |

Custom expressions are **TRUE = PASS** — write the condition that describes valid data; never
negate with `!()`.

### Comparison settings (cross-platform — see `cross-platform-recon.md`)
`sortMode` (`appendOrderBy` \| `deferredSort` \| `none`), numeric tolerances, and SimpleCompare
flags (`trimmingEnable`, `caseInsensitive`, `emptyStringAsNull`, `whiteSpaceAsNull`,
`ignoreDataType`). For cross-platform recons the producer should specify `sortMode` deliberately —
prefer `none` with identical explicit `ORDER BY` in both SQLs.

### Parameters
`parameterName`/`parameterId` when the SQL uses `#TOKEN#` substitution.

### Confirmation & provenance
| Field | Notes |
|---|---|
| `confirmedBy` | That the customer approved the plan containing this spec. |
| `openQuestions[]` | Fields intentionally left blank for Build mode to resolve with the customer. |

## ⚠️ Create-time-only settings

Some settings **cannot be changed by `update_rule`** — getting them wrong means recreating the
rule. Producers must decide these deliberately in the spec; Build mode must set them at creation:

- **`sortMode`** (Recon) — `update_rule` does not accept it. A misaligned cross-platform recon
  (every key reported as an orphan on *both* sides) cannot be patched; the rule must be recreated
  with the correct sort. See `cross-platform-recon.md` §1.

When in doubt whether a field is patchable on this server version, treat it as create-time-only.

## Build mode duties (summary — full workflow in author-rules SKILL.md)

1. Validate the spec: `ruleType` against `rule-taxonomy.md` — if mis-typed, **flag back to the
   producer/customer with reasoning; never silently re-choose.** Check required fields per type.
2. Honor the invariant: populated = approved; ask only about blanks and `openQuestions`.
3. `get_guidance` for the rule type is authoritative over any field naming in this document.
4. Create with the matching `create_*` tool; rules are auto-published.
5. Confirm back: `ruleId`, name, state, and what it checks — in the spec's own terms.

## Example — illustrative cross-platform schema-parity recon

```yaml
specVersion: 1
producedBy: icedq-compare-datasets
ruleType: Recon
ruleName: <SourceTable>_vs_<TargetTable>_SchemaParity_Recon
description: Schema-parity check for a table migration (UC7).
purpose: Detect dropped/renamed columns and NOT-NULL-to-nullable drift.
workspaceId: wksc-<resolved>
folderId: fldr-<resolved>
source:
  connectionId: conn-<source-db>
  sql: >
    SELECT UPPER(COLUMN_NAME) AS COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='<source_schema>' AND TABLE_NAME='<source_table>' ORDER BY 1
target:
  connectionId: conn-<target-db>
  sql: >
    SELECT UPPER(COLUMN_NAME) AS COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='<target_schema>' AND TABLE_NAME='<target_table>' ORDER BY 1
joinKeys: [{sourceColumn: COLUMN_NAME, targetColumn: COLUMN_NAME}]
checks: [{name: Chk_IS_NULLABLE, checkType: SimpleCompare,
          sourceColumn: IS_NULLABLE, targetColumn: IS_NULLABLE}]
resultTypes: [a-b, b-a, Xp]
sortMode: none          # create-time-only; identical ORDER BY 1 on both sides
dqDimension: Consistency
confirmedBy: customer
openQuestions: []
```

Field names above are illustrative per `conventions.md` §1 — when they differ from this server's
`get_guidance`, `get_guidance` wins.
