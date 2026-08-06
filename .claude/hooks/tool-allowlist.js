// PreToolUse allowlist evaluator. Reads the hook payload on stdin, exits 0 to
// allow and 2 to block. See tool-allowlist.sh for how it is wired up.

const fs = require('fs');

const BLOCK = 2;

function block(reason) {
  process.stderr.write(reason + '\n');
  process.exit(BLOCK);
}

function collectPatterns(node, out) {
  if (Array.isArray(node)) {
    for (const entry of node) {
      if (typeof entry === 'string') out.push(entry);
    }
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue; // $comment and friends are documentation
      collectPatterns(value, out);
    }
  }
  return out;
}

function toRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const allowlistPath = process.argv[2];

let allowlist;
try {
  allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
} catch (err) {
  block(
    `PreToolUse allowlist: could not read ${allowlistPath} (${err.message}). ` +
      'Blocking the call because the allowlist fails closed. Fix the file to restore tool access.'
  );
}

const patterns = collectPatterns(allowlist, []);
if (patterns.length === 0) {
  block(`PreToolUse allowlist: ${allowlistPath} contains no tool entries, so nothing is permitted.`);
}

let payload;
try {
  payload = JSON.parse(readStdin());
} catch {
  block('PreToolUse allowlist: hook payload was not valid JSON, blocking the call.');
}

// Copilot Chat sends { tool_name, tool_input }; Claude Code sends the same
// fields plus hook_event_name / tool_use_id. VS Code can suffix a tool call
// name with "__vscode..." when it disambiguates duplicates.
const rawName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
const toolName = rawName.split('__vscode')[0];

if (!toolName) {
  block('PreToolUse allowlist: payload had no tool_name, blocking the call.');
}

const allowed = patterns.some((pattern) => toRegExp(pattern).test(toolName));

if (!allowed) {
  block(
    `Tool "${toolName}" is not on the PreToolUse allowlist and was blocked. ` +
      `Use one of the permitted tools, or ask the user to add "${toolName}" to ${allowlistPath}.`
  );
}

process.exit(0);
