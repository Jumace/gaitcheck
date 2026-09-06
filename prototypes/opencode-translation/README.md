# OpenCode Translation Target Prototype

Throwaway experiment for issue [Prototype the OpenCode translation target](https://github.com/Jumace/gaitcheck/issues/10).

It replaces OpenCode's native `bash` tool with `.opencode/tools/bash.ts` and
tests whether a shared policy can keep `allow`, `ask`, and `deny` behavior in
the active OpenCode session.

The prototype config keeps the outer `bash` permission at `ask` by default and
allows only the small read-only command set explicitly. This is required for
`context.ask()` to reach the TUI; setting `bash` to global `allow` silently
approves every custom-tool request.

## Run

From this directory, start OpenCode:

```bash
opencode
```

Ask it to run these commands separately:

```text
git status
git commit -m prototype
git reset --hard HEAD
printf 'hello\n'
```

Expected behavior:

- Read-only commands run without an approval request.
- `git commit` produces OpenCode's native permission prompt through the custom
  tool's `context.ask()` call.
- `git reset --hard` is denied by the shared policy without execution.
- Unknown commands ask rather than silently execute.
- Commands containing shell operators ask rather than inheriting an allow decision from their first command.
- Each result includes the in-memory audit event in tool metadata.

## What This Tests

The custom tool preserves the native `bash` name and argument shape, so the
agent does not need a new command vocabulary. It intentionally uses Bun's
shell execution and does not attempt to reproduce all OpenCode shell parsing,
path scanning, output persistence, or production audit behavior.

The key result is whether `context.ask()` provides an acceptable in-session
approval experience while the policy decision remains outside OpenCode.

## Issue 14 Findings

Non-interactive probes confirm allow, ask, deny, working-directory, timeout,
and shell-pipeline behavior. The classifier now fails closed for shell
composition and catches destructive commands embedded after a command prefix.
The manual TUI prompt and full native OpenCode shell-parity behavior still
require an interactive session; this prototype does not reproduce native
shell parsing, path scanning, output persistence, or production audit
storage.
