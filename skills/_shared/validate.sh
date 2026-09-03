#!/usr/bin/env bash
# Structural validation for the skill bundle. Run in CI alongside sync.sh --check.
# Checks: frontmatter limits, SKILL.md line budget, TOC rule, shared-file drift.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - << 'PY'
import io, os, re, sys
fail = []

for skill in sorted(d for d in os.listdir(".") if d.startswith("icedq-") and os.path.isdir(d)):
    p = f"{skill}/SKILL.md"
    if not os.path.exists(p):
        fail.append(f"{skill}: missing SKILL.md"); continue
    raw = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    lines = raw.split("\n")

    # frontmatter
    fm = {}
    if lines[0] == "---":
        for l in lines[1:]:
            if l == "---": break
            m = re.match(r"^(name|description|server_compat):\s*(.*)$", l)
            if m: fm[m.group(1)] = m.group(2)
    for k in ("name", "description", "server_compat"):
        if k not in fm: fail.append(f"{p}: missing frontmatter field '{k}'")
    if "description" in fm and len(fm["description"]) > 1024:
        fail.append(f"{p}: description {len(fm['description'])} chars (max 1024)")
    if "name" in fm and not re.fullmatch(r"[a-z0-9-]{1,64}", fm["name"]):
        fail.append(f"{p}: name '{fm['name']}' violates lowercase/number/hyphen, max 64")
    if "name" in fm and fm["name"] != skill:
        fail.append(f"{p}: name '{fm['name']}' != directory '{skill}'")

    # body budget
    if len(lines) > 500:
        fail.append(f"{p}: {len(lines)} lines (max 500)")

    # references: exist + TOC rule
    for ref in set(re.findall(r"references/[a-z-]+\.md", raw)):
        rp = f"{skill}/{ref}"
        if not os.path.exists(rp):
            fail.append(f"{p}: broken reference {ref}"); continue
    refdir = f"{skill}/references"
    if os.path.isdir(refdir):
        for f in os.listdir(refdir):
            rp = f"{refdir}/{f}"
            rl = io.open(rp, encoding="utf-8", newline="").read().replace("\r\n", "\n").split("\n")
            if len(rl) > 100 and not any("## Contents" in l for l in rl[:25]):
                fail.append(f"{rp}: {len(rl)} lines but no '## Contents' TOC near top")

if fail:
    print("VALIDATION FAILED:"); [print("  -", f) for f in fail]; sys.exit(1)
print("structure OK")
PY

./_shared/sync.sh --check
echo "validation passed"
