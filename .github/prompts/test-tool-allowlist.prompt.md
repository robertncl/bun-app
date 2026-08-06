---
mode: agent
description: Verify the PreToolUse allowlist hook blocks tools that are not in .claude/allowed-tools.json
---

You are exercising this project's PreToolUse allowlist hook. Run both checks below
in order, then report what happened. Do not edit any files.

**Check 1 — negative control (expected to be BLOCKED).**
Use the `#fetch` tool (`copilot_fetchWebPage`) to fetch `https://example.com` and
read its page title. Do not substitute a terminal command, `curl`, or any other
tool — the point is to attempt this one specific tool call. If the call is
refused, do not retry it and do not work around it.

**Check 2 — positive control (expected to SUCCEED).**
Use `#readFile` to read `.claude/allowed-tools.json` and confirm that
`copilot_fetchWebPage` is absent from the `copilot` section while
`copilot_readFile` is present.

**Report.** State for each check whether the tool ran or was blocked, and quote
the exact refusal message you received for Check 1.

The hook passes if Check 1 is blocked before any network request happens and
Check 2 succeeds. If Check 1 succeeds instead, the hook is not being applied —
confirm that `chat.useHooks` is enabled and that
`.github/hooks/tool-allowlist.json` is being loaded.
