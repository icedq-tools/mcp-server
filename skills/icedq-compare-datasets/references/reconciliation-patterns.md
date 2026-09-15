# Reconciliation patterns — keeping two related systems agreeing, continuously

Reconciliation (steady-state) differs from migration testing in kind, not just degree. The two
sides are **different systems that must agree on something** — OLTP vs warehouse fact, billing app
vs GL, source extract vs BI layer — not copies of each other. They legitimately differ in grain,
structure, and timing. You are not proving equivalence; you are proving **agreement on the things
that must agree**, repeatedly, on a schedule.

Design consequences:
- **Scheduling-first.** A reconciliation that runs once is a spot check. Plan the recurring cadence
  (and the `icedq-schedule-and-monitor` handoff) as part of the design, not as an afterthought.
- **Tolerances are first-class.** Timing windows, rounding, and in-flight records mean exact-match
  checks generate noise. Agree tolerances with the customer up front (amount deltas, count deltas,
  cut-off windows) and encode them in the checks.
- **Aggregates before rows.** Row-by-row recon across two independently-run systems is expensive
  and often not even meaningful (different grain). Lead with aggregate agreement; drop to row level
  only where the grain genuinely matches and the customer needs row-level exceptions.

## The pattern menu (pick per agreement, not all of them)

### 1. Aggregate agreement — Recon (aggregated, GROUP BY)
The workhorse. Aggregate both sides to a **common grain** and compare group by group:
`SUM(amount)`, `COUNT(*)`, `COUNT(DISTINCT key)` per day / account / product / branch.
- Join on the group key(s); compare the aggregates with tolerance where agreed.
- This is a **Recon with GROUP BY SQL on both sides**, not a Checksum — Checksum compares exactly
  one value; grouped comparison needs the Recon engine so each group is its own row with its own
  pass/fail.
- Cross-platform: everything in `cross-platform-recon.md` applies (sortMode, case-normalised keys,
  numeric tolerance).

### 2. Totals tie-out — Checksum
One number per side: grand-total row count, grand-total amount. Cheapest possible agreement check
and the best first alert; pairs with #1 (Checksum tells you *that* they disagree, the grouped
Recon tells you *where*).

### 3. Row-by-row agreement — Recon (row-level)
Only where the two sides share a true common grain and key (e.g. transaction id exists in both).
Compare the columns that must agree; expect and configure tolerance/format handling for the rest.
High orphan counts here usually mean **timing** (one side hasn't loaded yet), not corruption —
consider a cut-off window in both SQLs (e.g. both sides filtered to `< today`).

### 4. Referential integrity across systems — Recon (A−B) or Pushdown
Every key in the downstream system must exist upstream (or vice versa): warehouse fact keys exist
in OLTP, GL postings trace to billing. Recon A−B for cross-connection checks; Pushdown when both
sides are reachable from one connection and tables are large.

### 5. No unexpected overlap — Recon (A ∩ B)
Sets that must be mutually exclusive stay that way (e.g. records must live in exactly one of two
systems after a split). Intersection check; expected result is zero.

### 6. Guardrail thresholds — Pushdown
Volume floors/ceilings, freshness (latest load timestamp within N hours), and drift limits
(today's total within X% of a trailing average, where the SQL can express it). SQL returns only
violating rows; 0 rows = pass. These catch the "pipeline silently stopped" class of failure that
agreement checks miss when both sides are equally stale.

## Grain analysis — do this before choosing patterns

Ask: what is the finest grain at which the two systems *should* agree?
- Same grain, same key → patterns 1–4 all available.
- Different grain (transactions vs daily positions, line items vs invoice headers) → aggregate one
  or both sides to the common grain in SQL; do **not** attempt row-by-row across grains.
- Derived/allocated values (FX conversion, apportionment) → agree the tolerance and the direction
  of truth (which system wins) with the customer before building.

A join-key uniqueness check (**Duplicate**) on each side at the chosen grain is cheap insurance —
an unexpectedly non-unique key turns a grouped recon into nonsense quietly.

## Interpreting recurring results

- **Same groups failing every run** → systematic difference (mapping gap, timezone cut-off,
  rounding rule). Investigate once, fix or encode as expected.
- **Different groups failing each run, near the tolerance edge** → tolerance too tight, or a
  timing window issue.
- **Sudden orphan spike on one side** → a load didn't run; check freshness guardrail (#6) first.
- **Both-sides orphans for the same keys** (row-level recon) → sort misalignment, not data —
  `cross-platform-recon.md` §1.
- Track pass/fail over time via the run history (`get_rule_workflow_run_history`) and, where
  available, the execution analytics warehouse — reconciliation value compounds through trend,
  not any single run.

## Rule-type discipline (recap)

Aggregate agreement per group = **Recon with GROUP BY**. Single grand total = **Checksum**.
Key-exists-in-other-system = **Recon A−B** or **Pushdown**. Mutual exclusivity = **Recon A∩B**.
Thresholds/freshness = **Pushdown**. Key uniqueness per side = **Duplicate**. Row-level contract on
one side (nulls, domains) = **Validation** — useful, but it belongs to that dataset's own quality
plan, not the reconciliation; suggest it separately rather than padding the recon set.
