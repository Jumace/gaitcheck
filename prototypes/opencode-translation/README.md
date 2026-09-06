# OpenCode Translation Target Prototype

Throwaway experiment for issue [Prototype the OpenCode translation target](https://github.com/Jumace/gaitcheck/issues/10).

It replaces OpenCode's native `bash` tool with `.opencode/tools/bash.ts` and
tests whether a shared policy can keep `allow`, `ask`, and `deny` behavior in
the active OpenCode session.

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
- Each result includes the in-memory audit event in tool metadata.

## What This Tests

The custom tool preserves the native `bash` name and argument shape, so the
agent does not need a new command vocabulary. It intentionally uses Bun's
shell execution and does not attempt to reproduce all OpenCode shell parsing,
path scanning, output persistence, or production audit behavior.

The key result is whether `context.ask()` provides an acceptable in-session
approval experience while the policy decision remains outside OpenCode.
