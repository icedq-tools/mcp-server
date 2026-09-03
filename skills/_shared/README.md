# _shared — single source of truth for cross-skill references

Skills ship self-contained (each bundle must work standalone on a customer's server), so shared
reference files are **copied** into each skill's `references/` directory — but they are **edited
only here**. Never edit a skill's copy directly.

| File | Owned knowledge | Consumed by |
|---|---|---|
| `conventions.md` | ID resolution, get_guidance-first, async follow-up, communication | all skills |
| `rule-taxonomy.md` | Rule-type decision guide + naming conventions | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules |
| `rule-spec.md` | The producer→Build-mode creation contract | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules |
| `cross-platform-recon.md` | Cross-engine comparison pitfalls (sort, types, tolerance) | author-rules, compare-datasets, mapping-doc-rules, etl-code-rules |

Run `./sync.sh` after editing to push copies out. CI should run `./sync.sh --check` and fail the
build on drift.
