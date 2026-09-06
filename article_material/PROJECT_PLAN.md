# Agent Command Broker Prototype

Status: proposed first prototype

## Purpose

This project explores whether an agent becomes easier to trust when all of its ordinary system interaction is routed through one MCP tool that runs shell commands on its behalf.

The first prototype is a trust and convenience layer, not a security boundary. Its purpose is to prevent normal agent overreach from going unnoticed and to create useful moments for human confirmation before consequential actions.

The first target is OpenCode. Other harnesses may be tested later.

## Problem

AI coding agents often try to complete the larger task they infer rather than stopping at the narrow step the user intended. A request to change code can grow into committing, pushing, opening a pull request, deploying, or changing external infrastructure.

The user experience we want to improve is:

```text
small requested step -> agent infers a larger goal -> consequential action happens
```

The prototype should turn the consequential action into a visible decision point without requiring the user to approve every harmless command.

## First-Iteration Decision

Use one generic MCP tool for system interaction:

```text
run_bash_command(command, cwd?)
```

Configure OpenCode to deny its native system-interaction tools and allow the command-runner MCP tool. This is a configuration-level constraint. It is not intended to prevent a deliberately misconfigured user, a malicious process, or an alternative unrestricted tool from bypassing the MCP server.

The first iteration should validate the MCP workflow before adding containers, microVMs, OS sandboxing, network isolation, or credential brokering.

## Goals

- Route normal OpenCode system interaction through the MCP command tool.
- Make consequential commands visible and interruptible.
- Support configurable `allow`, `ask`, and `deny` decisions.
- Let ordinary read-only development commands remain frictionless.
- Explain each approval or denial in language a user can understand.
- Return normal command output, errors, and exit codes to the harness.
- Record command requests and policy decisions for later inspection.
- Keep the server usable as a standalone component outside one specific agent harness.
- Establish an interface that can later sit in front of stronger enforcement.

## Non-Goals

- Defending against a determined attacker.
- Guaranteeing that a misconfigured harness uses the MCP server.
- Replacing OpenCode's own permissions permanently.
- Preventing direct API access.
- Providing a complete filesystem or network sandbox.
- Protecting users from deliberately enabling another unrestricted MCP server.
- Solving credential isolation in the first version.
- Supporting every operating system or shell immediately.

## Proposed Architecture

```text
OpenCode
  |
  | MCP tool invocation
  v
Local command broker
  - receives command and working directory
  - classifies the request
  - evaluates policy
  - asks, denies, or executes
  - records the decision
  |
  v
Shell command
  - first prototype uses the local user's normal environment
```

The MCP server should be a separate process. The first prototype may run with the same operating-system privileges as OpenCode, but this limitation must remain explicit in the documentation.

## OpenCode Configuration

The prototype configuration should:

- Deny native `bash` or shell execution.
- Deny native file tools where OpenCode exposes equivalent direct access.
- Allow the named command-broker MCP tool.
- Disable or remove other MCP servers that provide unrestricted system access during testing.
- Prefer managed or host-controlled configuration when testing whether the setup is being followed.

This configuration improves the normal path but does not create an absolute guarantee. If OpenCode, a plugin, another MCP server, or a modified configuration provides another OS route, the route exists outside this prototype's control.

## Command Policy

The policy should support explicit rules for executable and subcommand patterns. The default behavior can be configurable, but the initial experiment may use allow-by-default with targeted `ask` and `deny` rules because the goal is to measure friction from selective intervention.

Example:

```yaml
default: allow

commands:
  git:
    ask:
      - [commit]
      - [push]
      - [reset]
    deny:
      - [reset, --hard]
      - [clean, --force]

  gh:
    ask:
      - [pr, create]
      - [pr, merge]

  terraform:
    ask:
      - [apply]
      - [destroy]

  kubectl:
    ask:
      - [delete]
      - [apply]

  aws:
    ask:
      - [cloudformation, deploy]
```

This is a convenience policy, so it should not claim to identify every equivalent command. A blacklist alone is too easy to misunderstand. The implementation should describe these as rules that classify known patterns, with an explicit fallback for unmatched commands.

## Classification Rules

The server should inspect at least:

- The command text.
- The parsed executable and arguments where possible.
- The working directory.
- Shell operators such as chaining, redirects, pipelines, and substitutions.
- Interpreters and opaque runners such as `sh`, `bash`, `python`, `node`, `npx`, `make`, and project scripts.
- Whether the command is likely to modify local files.
- Whether the command changes remote or external state.

The first implementation does not need perfect shell security parsing. It should instead be honest about uncertainty. Commands whose meaning cannot be classified confidently should be configurable as `ask`, and the approval message should identify them as opaque or potentially indirect commands.

## Approval Experience

Approval should show:

- The command exactly as received.
- The working directory.
- The matched policy rule.
- The reason the command requires approval.
- The likely scope of the side effect when known.

Example:

```text
The agent wants to run:

  git push origin feature/agent-policy

Working directory:
  /home/user/project

Reason:
  This may change a remote repository.

Allow once, allow for this session, or deny?
```

Approval scopes to consider:

- Allow once.
- Allow the exact command for the session.
- Allow the matching command family for the session.
- Deny once.
- Deny the matching pattern.

The recommended first useful scope is `allow once` plus `allow for this session`. Persistent approvals can come after the interaction has been tested.

## Approval Transport Decision

MCP does not automatically provide a user interface for selective approval. The prototype must choose one of these approaches:

- Have the local server prompt through the user's terminal or a separate local UI.
- Return an approval-required result and use OpenCode's permission flow.
- Ask for every invocation through OpenCode first, then add server-side selective approval.

The preferred experiment is a local terminal prompt if it can be implemented without corrupting the MCP stdio stream. MCP protocol messages must remain on stdout; human-facing prompt output should use a separate channel such as the controlling terminal or stderr.

If that is awkward, use OpenCode's permission flow for the first implementation and accept that it may ask too often. The choice should be recorded as an implementation constraint, not hidden as if MCP itself supplies approval.

## Execution Contract

The tool should accept a minimal structured input:

```json
{
  "command": "git status --short",
  "cwd": "/home/user/project"
}
```

The result should include:

- Standard output.
- Standard error.
- Exit status.
- Whether the command was allowed, approved, or denied.
- A human-readable policy explanation when it did not run.

Environment handling should initially be simple and documented. Later versions should add explicit environment selection, secret filtering, timeouts, and resource limits.

## Implementation Order

### 1. Establish the standalone MCP server

- Choose the implementation language and MCP SDK.
- Add the smallest server that exposes `run_bash_command`.
- Implement command execution with captured output and exit status.
- Ensure protocol output and diagnostic output use separate streams.

### 2. Add policy configuration

- Define the configuration file location.
- Parse `allow`, `ask`, and `deny` rules.
- Define matching precedence.
- Return the matched rule in the result and audit record.
- Decide how malformed policies fail.

### 3. Add approval handling

- Implement one-shot approval.
- Implement session approval if the first interaction supports it cleanly.
- Display the command, cwd, reason, and selected rule.
- Deny when approval cannot be obtained rather than silently proceeding.

### 4. Configure OpenCode

- Add an example MCP server configuration.
- Deny native system tools in the test profile.
- Allow the broker tool.
- Remove competing unrestricted tools from the controlled test setup.

### 5. Add auditing

- Record timestamp, command, cwd, decision, matched rule, and exit status.
- Avoid recording sensitive environment values or command arguments known to contain secrets.
- Make the log easy to inspect during experiments.

### 6. Test agent behavior

- Ask the agent to perform a small code change.
- Confirm that read-only commands remain smooth.
- Confirm that commits and pushes stop for approval.
- Confirm that denied commands return an understandable explanation.
- Try scripts, command chains, interpreters, and project runners.
- Repeat with a second harness only after the OpenCode path is useful.

## Acceptance Criteria

The first prototype is successful if:

- OpenCode can complete ordinary read-only work through the MCP tool.
- The agent does not need to know a new command syntax beyond the MCP tool interface.
- Consequential commands are visible before execution.
- A user can approve or deny without manually reconstructing the intended action.
- Denied commands produce useful feedback that lets the agent continue or explain the blockage.
- The audit log makes it possible to reconstruct what the agent attempted.
- The user reports increased willingness to let the agent take larger steps.

The prototype is not successful merely because it blocks a list of dangerous strings. The meaningful result is improved trust with acceptable interruption cost.

## Known Limitations

- OpenCode configuration can be changed or bypassed.
- A generic command runner can execute arbitrary local actions.
- Pattern matching cannot reliably understand every shell script or indirect effect.
- The MCP server has the privileges of the account running it.
- Direct API calls and other tools are outside the first policy path.
- Command output can contain prompt injection or misleading instructions.
- Approval decisions can become habitual and be accepted without review.
- The current design does not isolate credentials or network access.

## Future Enforcement Path

If the trust experiment is useful, retain the MCP interface and add enforcement beneath it rather than redesigning the user-facing workflow.

Possible later layers include:

- A fixed absolute executable launcher and sanitized environment.
- Linux bubblewrap plus Landlock and, where appropriate, seccomp.
- macOS Seatbelt or another supported macOS sandbox mechanism.
- A container or microVM for stronger isolation.
- Forced network egress through a policy-aware proxy.
- Short-lived, destination-scoped credential brokering.
- A host-managed broker that runs outside a restricted harness environment.

The eventual architecture is:

```text
Agent harness
  -> MCP policy broker
  -> policy and approval decision
  -> enforcement adapter
  -> command, filesystem, network, or credential operation
```

## Research Basis

The design was informed by the following primary sources:

- OpenCode permissions: https://opencode.ai/docs/permissions/
- OpenCode MCP servers: https://opencode.ai/docs/mcp-servers/
- MCP tools and security: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP roots: https://modelcontextprotocol.io/specification/2025-06-18/client/roots
- MCP local server security: https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
- MCP stdio transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Linux Landlock: https://docs.kernel.org/userspace-api/landlock.html
- bubblewrap: https://github.com/containers/bubblewrap/blob/main/README.md
- Docker Sandboxes: https://docs.docker.com/ai/sandboxes/
- Claude Code sandboxing: https://code.claude.com/docs/en/sandboxing
- Codex sandboxing: https://developers.openai.com/codex/sandboxing/
- E2B network controls: https://docs.e2b.dev/network/internet-access
- Vercel Sandbox firewall: https://vercel.com/docs/sandbox/concepts/firewall
