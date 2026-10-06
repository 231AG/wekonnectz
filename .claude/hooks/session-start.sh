#!/bin/bash
# SessionStart hook for Claude Code cloud sessions.
# Installs dependencies, makes Docker available for the local Supabase stack, and points
# Playwright at the preinstalled Chromium. Idempotent. Does not start Supabase (slow);
# run `pnpm db:start` when database work is needed.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

pnpm install --frozen-lockfile --prefer-offline

if ! docker info >/dev/null 2>&1; then
  if command -v dockerd >/dev/null 2>&1; then
    (nohup dockerd >/tmp/dockerd.log 2>&1 &)
    for _ in $(seq 1 90); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi
fi
docker info >/dev/null 2>&1 && echo "session-start: docker ready" || echo "session-start: docker NOT available"

if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  echo 'export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
