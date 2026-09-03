# Advisor playbook — requirements, coverage, recommendations, plan format

## A. Requirements question sets (ask in batches; skip what's answered)

**Batch 1 — scope.** What data do you want to test (system / domain / tables, even roughly)?
Where does it live (which platform), if you know? Is there one table that matters most?

**Batch 2 — motivation.** What prompted this — a known incident, downstream complaints, an audit,
a new pipeline, general hygiene? What breaks (report, decision, process) when this data is wrong?

**Batch 3 — expectations.** What does "good data" mean here — no missing values in which fields?
No duplicates on what identity? Values within what ranges/domains? Data no older than what?
Any tolerance for known imperfections?

**Batch 4 — operational.** Should these checks run once, or on a schedule (after loads? nightly)?
Who acts on a failure? How severe is a failure — stop-the-line or notify?

Routing tells to watch for during intake (hand off per SKILL.md golden rule 1): "we're moving /
migrating / cutting over" → compare-datasets (migration); "these two systems should agree /
reconcile X against Y" → compare-datasets (reconciliation); "here's our mapping sheet" →
mapping-doc-rules; "here's the stored proc / dbt model" → etl-code-rules; a precise check list
("NotNull on A, unique on B") → author-rules.

## B. Coverage analysis method

Goal: a per-table map of existing protection, before recommending anything new.

1. Scope = the tables from Step 2. For each, gather candidate rules:
   `list_rules(workspaceId, nameFilter=<table name>)`, plus rules in folders named after the
   domain/table (`list_folders(nameFilter=…)` → `list_rules` per folder).
2. For plausible matches, `get_rule` (selectively — it is expensive; skip rules whose name/type
   clearly identify them) to confirm which table/columns the rule actually reads.
3. Build the coverage map per table:

   | Table | Validation | Duplicate | Recon/Checksum | Pushdown | Last run |
   |---|---|---|---|---|---|

4. Classify: **protected** (row-level + uniqueness + a cross-dataset or guardrail check),
   **partial** (some types present), **unprotected** (none). Present in those words, with the
   evidence.
5. For near-matches: recommend **reuse** (covers the need), **extend** (right rule, missing checks
   → `update_rule` spec change via Build mode), or **replace** (wrong grain/settings — remember
   create-time-only settings like Recon `sortMode` force recreation).

Never present a recommendation the coverage map already satisfies.

## C. Recommendation heuristics (applied on top of `suggest_quality_checks`)

Profiling signals → candidate checks (each with a plain-language why):

| Signal (from profile_data / sample data) | Candidate check | Rule type |
|---|---|---|
| Column is an identity/business key | Uniqueness on the key | **Duplicate** |
| Business-critical column with any nulls (or none, to keep it that way) | NotNull | **Validation** |
| Low distinct count / code-like values | ValidValues on the observed domain | **Validation** |
| Fixed-length identifiers (codes, ISINs, phone, zip) | Length / Format | **Validation** |
| Dates stored as TEXT | Format guard + parse validity | **Validation** (Custom) |
| Numeric with business bounds (amounts, quantities, ages) | Range | **Validation** (Custom) |
| Column referencing another table's key | Orphan check | **Pushdown** (or Recon A−B cross-connection) |
| Versioned/SCD table | One open row per key | **Pushdown** |
| Table loaded on a cadence | Freshness (load_ts within N) + volume floor | **Pushdown** |
| Same data staged in two places in scope | Row-count tie-out; aggregate agreement | **Checksum** / **Recon** |

Prioritization order for the plan: (1) keys and uniqueness, (2) mandatory-field completeness,
(3) operational guardrails (freshness/volume — they catch silent pipeline death), (4) referential
integrity, (5) domains/formats/ranges, (6) cross-dataset agreement. Combine all row-level checks
for one table into ONE Validation rule.

Clean profiles are normal — say so, and recommend the structural protections (uniqueness,
guardrails) that clean data still needs.

## D. Data Testing Plan format

Per `conventions.md` §8 — keep the business what/why (the header line below) and the rule type and
its why (the bullet line below) as the two visibly separate parts of this one plan.

Present per priority tier, in plain language:

```
DATA TESTING PLAN — <scope name>
Coverage today: X tables protected · Y partial · Z unprotected

P1 <Table> — <what it protects, one line>
    <check> · <rule type> (why this type, one clause) · [new | extends <rule>]
P2 …

Folder: <proposed>   Rules to create: N (types: …)   Reuse/extend: M existing
After this plan: <which tables move to protected; what remains uncovered>
```

Review loop: ask what to add/drop/reprioritize; re-present until approved. Then convert each line
to a rule spec (`rule-spec.md`) and hand to Build mode.
