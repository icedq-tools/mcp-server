#!/usr/bin/env bash
# Build upload-ready skill ZIPs: validate → sync-check → zip each skill.
# Output: dist/skill-zips/<skill>.zip (one ZIP per skill, skill folder at ZIP root,
# as required by the claude.ai "Upload a skill" flow).
#
# Usage: skills/_shared/package.sh [output_dir]   (default: dist/skill-zips)
set -euo pipefail
cd "$(dirname "$0")/.."          # skills/
REPO_ROOT="$(cd .. && pwd)"
OUT="${1:-$REPO_ROOT/dist/skill-zips}"

echo "== 1/3 validate =="
./_shared/validate.sh            # frontmatter limits, line budgets, TOCs, sync drift

echo "== 2/3 clean output =="
rm -rf "$OUT"
mkdir -p "$OUT"

echo "== 3/3 package =="
for d in icedq-*/; do
  s="${d%/}"
  zip -qr "$OUT/${s}.zip" "$s" -x "*.DS_Store" -x "*__pycache__*"
  echo "packaged: ${s}.zip ($(du -h "$OUT/${s}.zip" | cut -f1 | tr -d ' '))"
done

echo
echo "Done. Upload each ZIP via claude.ai → Customize → Skills → + → Upload a skill."
ls -1 "$OUT"
