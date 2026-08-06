#!/usr/bin/env bash
# PreToolUse allowlist enforcer, shared by GitHub Copilot Chat and Claude Code.
#
# Both agents invoke this with the PreToolUse payload on stdin and use the same
# exit-code contract:
#   exit 0 -> allow the tool call
#   exit 2 -> block the tool call, stderr is fed back to the model
#
# Registered in:
#   .github/hooks/tool-allowlist.json  (Copilot Chat, "preToolUse")
#   .claude/settings.json              (Claude Code, "PreToolUse")
#
# The allowlist lives in .claude/allowed-tools.json. This script fails closed:
# if the allowlist is missing or unparseable, every tool call is blocked.

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
allowlist="${TOOL_ALLOWLIST_FILE:-$here/../allowed-tools.json}"

runtime=""
for candidate in node bun; do
  if command -v "$candidate" >/dev/null 2>&1; then
    runtime="$candidate"
    break
  fi
done

if [[ -z "$runtime" ]]; then
  echo "PreToolUse allowlist: neither node nor bun is on PATH, cannot evaluate the allowlist." >&2
  exit 2
fi

exec "$runtime" "$here/tool-allowlist.js" "$allowlist"
