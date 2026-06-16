#!/bin/bash
set -e

# Only run a DB schema sync if this merge touched schema files.
# drizzle-kit push is slow (~25s) so we skip it when nothing changed.
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -qE '^lib/db/src/schema'; then
  echo "Schema files changed — running drizzle-kit push"
  pnpm --filter @workspace/db run push
else
  echo "No schema changes — skipping drizzle-kit push"
fi
