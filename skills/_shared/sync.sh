#!/usr/bin/env bash
# Sync _shared reference files into each skill's references/ directory.
# Usage: ./sync.sh          (copy)
#        ./sync.sh --check  (exit 1 on drift; for CI)
set -euo pipefail
cd "$(dirname "$0")"

# skill:file1,file2,...  (relative to _shared/)
MANIFEST="
icedq-author-rules:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
icedq-run-and-report:conventions.md
icedq-schedule-and-monitor:conventions.md
icedq-mapping-doc-rules:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
icedq-etl-code-rules:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
icedq-compare-datasets:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
icedq-suggest-checks:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
icedq-api-testing:conventions.md,rule-taxonomy.md,rule-spec.md,cross-platform-recon.md,groovy-recipes.md
"

MODE="${1:-copy}"
STATUS=0
while IFS=: read -r skill files; do
  [ -z "$skill" ] && continue
  dest="../$skill/references"
  [ -d "../$skill" ] || { echo "skip (absent): $skill"; continue; }
  mkdir -p "$dest"
  IFS=',' read -ra list <<< "$files"
  for f in "${list[@]}"; do
    if [ "$MODE" = "--check" ]; then
      if ! cmp -s "$f" "$dest/$f" 2>/dev/null; then
        echo "DRIFT: $skill/references/$f"; STATUS=1
      fi
    else
      cp "$f" "$dest/$f"; echo "synced: $skill/references/$f"
    fi
  done
done <<< "$MANIFEST"
exit $STATUS
