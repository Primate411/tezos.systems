#!/bin/sh
# Stamp build info into version.json
# Installed as pre-commit hook: .git/hooks/pre-commit → ../../scripts/stamp-version.sh
#
# The commit hash will be one-behind (HEAD at pre-commit time), but the build
# number is what matters for identifying deployed versions. The hash is a bonus.

REPO_ROOT="$(git rev-parse --show-toplevel)"
COUNT="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
COUNT=$((COUNT + 1))
HASH="$(git rev-parse --short HEAD 2>/dev/null || echo 'initial')"
DATE="$(date -u +%Y-%m-%d)"

cat > "$REPO_ROOT/version.json" <<EOF
{"build":${COUNT},"commit":"${HASH}","date":"${DATE}"}
EOF

git add "$REPO_ROOT/version.json" 2>/dev/null
