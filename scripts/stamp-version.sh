#!/bin/sh
# Stamp current git state into version.json
# Install as pre-commit hook: ln -sf ../../scripts/stamp-version.sh .git/hooks/pre-commit

REPO_ROOT="$(git rev-parse --show-toplevel)"
COUNT="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
# In pre-commit, HEAD is the previous commit. Increment by 1 for the upcoming commit.
COUNT=$((COUNT + 1))
HASH="$(git rev-parse --short HEAD 2>/dev/null || echo 'initial')"
DATE="$(date -u +%Y-%m-%d)"

cat > "$REPO_ROOT/version.json" <<EOF
{"build":${COUNT},"commit":"${HASH}","date":"${DATE}"}
EOF

git add "$REPO_ROOT/version.json" 2>/dev/null
