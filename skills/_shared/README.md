# `_shared` — single source of truth for cross-skill references

Skills ship self-contained (each bundle must work standalone on a customer's server), so shared
reference files are **copied** into each skill's `references/` directory — but they are **edited
only here**. Never edit a skill's copy directly.

| File | Owned knowledge | Copied into (`sync.sh` manifest) |
|---|---|---|
| `conventions.md` | ID resolution, `get_guidance`-first, async follow-up, communication | all eight skills |
| `rule-taxonomy.md` | Rule-type decision guide + naming conventions | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules, suggest-checks, api-testing |
| `rule-spec.md` | The producer → Build-mode creation contract | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules, suggest-checks, api-testing |
| `cross-platform-recon.md` | Cross-engine comparison pitfalls (sort, types, tolerance) | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules, suggest-checks, api-testing |
| `groovy-recipes.md` | Groovy check expression patterns | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules, suggest-checks, api-testing |

`icedq-run-and-report` and `icedq-schedule-and-monitor` receive **only** `conventions.md`.

## Scripts in this folder

| Script | Purpose |
|---|---|
| `./sync.sh` | Copy the files above into each skill's `references/` |
| `./sync.sh --check` | Exit 1 if any copy has drifted (for CI) |
| `./validate.sh` | Frontmatter limits, `SKILL.md` ≤500 lines, TOCs on long references, then `sync.sh --check` |
| `./package.sh` | Validate, then zip each `icedq-*` skill into `dist/skill-zips/` |

Run `./sync.sh` after editing. CI should run `./sync.sh --check` (or `./validate.sh`) and fail the
build on drift. Architecture and routing boundaries: `../COMPATIBILITY.md`.
