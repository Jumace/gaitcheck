# Beginner's Guide

## What Is This Project?

Gaitcheck is an experiment for making coding agents easier to trust.

A coding agent can run commands on your computer. Some commands are harmless:

```bash
git status
git diff
printf 'hello\n'
```

Other commands can change important things:

```bash
git commit
git push
terraform apply
git reset --hard HEAD
```

The problem is not that every command is dangerous. The problem is that an
agent can move from a small request to a larger action without making that
change obvious.

Gaitcheck tests a simple idea:

- Let harmless commands run normally.
- Ask the human before consequential commands.
- Block commands that the Policy marks as destructive.
- Explain the decision.

## The Three Decisions

Every command receives one Policy decision.

### Allow

The command matches a safe Policy rule.

It runs without an Approval request.

Example:

```text
git status -> allow
```

### Ask

The command may change something important, or the Policy does not understand
it well enough.

The Harness adapter shows an Approval request. The human can reject the
command or approve it.

Example:

```text
```

### Deny

The Policy identifies a command as destructive or disallowed.

The command does not receive an Approval request. The Execution core does not
run it.

Example:

```text
```

The decision precedence is:

```text
```

This means a safety rule can override a broad allow rule.

## How the Pieces Fit Together

The project uses a few names for separate responsibilities.

### Operation request

An Operation request is the common form of an action that an agent wants to
perform.

The first Operation is:

```text
command.execute
```

For example:

```text
operation: command.execute
raw command: git status
working directory: /home/eule/code/gaitcheck
```

### Policy

The Policy looks at the Operation request and returns `allow`, `ask`, or
`deny`.

It uses the Raw command as the exact command text. It can also use Parsed
command metadata, such as the executable and arguments. Parsed metadata helps
classification, but it cannot replace the Raw command.

### Harness adapter

A Harness is the application running the agent. OpenCode is the first Harness
used in this project.

A Harness adapter connects the shared Policy to one Harness. It translates the
Harness-specific tool call into an Operation request and translates the result
back into the Harness format.

The goal is to keep the Policy the same even when the Harness changes.

### Approval request

When the Policy returns `ask`, the Harness adapter creates an Approval request.

The request should show:

- The exact command.
- The working directory.
- The matched Policy rule.
- The reason for the request.

OpenCode shows this request in its own TUI.

### Execution core

The Execution core runs an approved command and collects its result.

The current OpenCode prototype uses Bun to start:

```text
bash -lc <raw command>
```

It captures output, errors, exit status, and timeout state.

### Audit event

The adapter creates an in-memory Audit event for the operation. It includes
information such as:

- Raw command.
- Working directory.
- Policy decision.
- Matched rule.
- Explanation.
- Approval status.
- Exit status.
- Correlation identity.

The current prototype does not write a permanent audit log.

## What Happens to a Command?

This is the normal flow:

```text
1. The agent asks the Harness to run a command.
2. The Harness adapter receives the command.
3. The adapter creates an Operation request.
4. The Policy evaluates the request.
5. The Policy returns allow, ask, or deny.
6. If needed, the Harness shows an Approval request.
7. The Execution core runs an approved command.
8. The adapter returns an Operation result and Audit event.
```

## Why Is the Name `command.execute`?

`command.execute` is not a shell command. It is a shared name for the type of
Operation.

OpenCode calls its tool `bash`. Another Harness may call its tool `Bash`,
`shell`, or something else. The adapter converts all of these into the same
shared Operation name:

```text
command.execute
```

This lets the Policy work across Harness adapters.

Other Operation values may be added later, such as:

```text
file.read
file.write
network.request
```

They are not part of the first implementation.

## How OpenCode Works Today

The OpenCode prototype replaces the built-in `bash` tool with a local custom
tool:

```text
prototypes/opencode-translation/.opencode/tools/bash.ts
```

The tool keeps the name `bash`, so the agent does not need a new vocabulary.
The custom tool calls the shared Policy evaluator before it starts a process.

The OpenCode configuration is here:

```text
prototypes/opencode-translation/opencode.jsonc
```

The configuration is important. If `bash` has a global `allow` permission,
OpenCode can approve every custom-tool request before `context.ask()` reaches
the TUI. The prototype therefore uses granular rules with a default `ask`.

## Try It

From the repository:

```bash
cd /home/eule/code/gaitcheck/prototypes/opencode-translation
npm install --prefix .opencode
opencode
```

Restart OpenCode after changing the configuration.

Test a safe command:

```text
Use the bash tool exactly once with command: printf 'hello\n'. Report the complete tool result.
```

It should run without an Approval request.

Test an unknown command:

```text
Use the bash tool exactly once with command: echo beginner-test. Report the complete tool result.
```

An Approval request should appear. Reject it first. Then run it again and
choose Allow once.

Test a composed command:

```text
Use the bash tool exactly once with command: printf 'left\nright\n' | wc -l. Report the complete tool result.
```

The OpenCode configuration asks for approval because this command contains a
pipeline. Allow once and the output should be `2`.

Test the shared tests:

```bash
cd /home/eule/code/gaitcheck
npm test
```

## What It Can Do

The current prototype can:

- Classify known commands as `allow`, `ask`, or `deny`.
- Ask for approval inside the OpenCode TUI.
- Keep safe commands free of approval prompts.
- Reject an unknown command.
- Block destructive Git commands.
- Evaluate command parts in a composed command.
- Capture command output and exit status.
- Apply a timeout.
- Apply an explicit working directory.
- Produce an in-memory Audit event.

## What It Cannot Do

The current prototype cannot:

- Stop a determined process from bypassing the adapter.
- Sandbox the operating system.
- Protect credentials from the process environment.
- Isolate network access.
- Fully parse every shell feature.
- Reproduce every native OpenCode shell behavior.
- Store audit events permanently.
- Provide the final user-friendly Policy configuration format.
- Act as a Claude Code adapter or CLI wrapper.

The prototype runs with the same operating-system privileges as the user who
starts OpenCode. A user can change the OpenCode configuration, install another
plugin, enable another tool, or run a separate process. This is why the
project describes the current work as a trust and visibility experiment.

## What Comes Next

The next major work is to define the shared normalized Execution contract and
the universal Audit contract. These will allow OpenCode, Claude Code, MCP, and
CLI-wrapper adapters to use the same result and audit vocabulary.

The later user-facing Policy configuration is tracked in:

[Issue #15: Design user-facing Policy configuration](https://github.com/Jumace/gaitcheck/issues/15)

That future format is expected to support lists, patterns, and regular
expressions. The current evaluator deliberately uses only exact and prefix
matching.
