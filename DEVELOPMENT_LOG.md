# Development Log

This log records the design path of the project, including decisions that were
later questioned or replaced. It is intentionally written as source material
for a future article, not as a polished project history.

## Starting Point

The project began with a trust problem rather than a security problem.

An agent may infer a larger goal than the user explicitly requested. A small
code change can turn into a commit, push, pull request, deployment, or external
infrastructure change. The desired result is not to defend against a
determined attacker. It is to make consequential actions visible and
interruptible so that a user becomes more willing to delegate larger tasks.

The first working name for this idea was an agent command broker or trust
governor. The word "broker" is now considered temporary and may be replaced.

## First Concrete Direction: CLI Wrappers

The first implementation idea was to put wrappers earlier in `PATH` than
selected command-line tools such as `git`, `gh`, `aws`, `kubectl`, and
`terraform`.

Examples:

```text
git status        -> allow
git diff          -> allow
git commit        -> ask
git push          -> ask
git reset --hard  -> deny
```

This direction was attractive because it was small, familiar, and potentially
usable by many agent harnesses. The agent could continue using ordinary shell
commands, while the wrapper provided one place for policy evaluation and
auditing.

The limitations were identified early:

- `PATH` lookup is a convention, not an authorization boundary.
- Absolute executable paths can bypass wrappers.
- Scripts, interpreters, libraries, plugins, and direct APIs can avoid the
  expected command family.
- Different commands can produce equivalent effects, such as `git push`, a
  release script, `make publish`, or `npm run deploy`.

The wrapper idea was not discarded. It remains a possible broad-compatibility
adapter, especially for harnesses that do not expose useful extension points.

## Second Direction: MCP OS Interface

The next idea was to give the agent one MCP server for operating-system
interaction and configure the harness not to use native system tools.

Several narrow tools were considered:

```text
read_project_file
run_tests
```

Narrow tools make intent explicit, but requiring a separate tool for every
operation could become cumbersome and would not match existing development
workflows.

The selected first MCP interface became one generic tool:

```text
run_bash_command(command, cwd?)
```

The proposed local MCP server would classify the command, apply an
`allow`/`ask`/`deny` policy, execute allowed commands, explain decisions, and
record an audit trail. OpenCode would be configured to deny native shell and
equivalent direct system tools while allowing the MCP tool.

This was a reasonable first experiment for the stated threat model. It offered
a consistent mediation point without claiming to be a sandbox or security
boundary.

## Runtime Decision

The runtime decision was resolved in favor of:

- Node.js 24 LTS.
- The official MCP TypeScript SDK v2.
- MCP stdio transport.
- The SDK's server package and `StdioServerTransport`.

Vercel tooling was considered but did not match the first requirement. Vercel
AI SDK MCP support is primarily useful for consuming MCP tools, while Vercel
MCP adapters target hosted or HTTP-oriented integrations. The first component
needs to host a local MCP server over stdio, so the official MCP SDK is the
more direct fit.

This runtime decision remains useful even if MCP later becomes one adapter
among several rather than the universal foundation.

## OpenCode Configuration Decision

OpenCode was the first target. Its current configuration can deny native tools
and allow a specifically named MCP tool. MCP tool names are exposed with a
server-name prefix, so the exact sanitized tool name must be allowed rather
than a broad wildcard.

The controlled profile is explicitly cooperative:

- It improves visibility and makes the intended normal path easier to inspect.
- It does not revoke operating-system privileges.
- Configuration can be changed.
- Plugins, custom tools, other MCP servers, and alternate clients can provide
  other routes.
- The local server still has the privileges of the account running it.

The project language was updated to describe this as a trust and visibility
experiment, not as security software.

## Approval Transport Investigation

The initial MCP design needed a way to ask the human before executing a
consequential command. Three possibilities were considered:

1. A prompt in the broker's controlling terminal.
2. An approval-required result handled by OpenCode.
3. Native MCP elicitation.

MCP elicitation looked like the correct ecosystem-native answer. It is a
server-to-client `elicitation/create` request nested inside an MCP operation.
The client is responsible for presenting the user interface and returning
`accept`, `decline`, or `cancel`. This is not a separate model-invoked
`get_approval` tool, which could be skipped by the model.

The intended behavior was:

- `accept` allows the command to proceed.
- `decline` or `cancel` denies it.
- Unsupported elicitation, unavailable capability, and timeout deny it.
- No failure should silently become approval.

## The OpenCode Compatibility Problem

Research against current OpenCode documentation and upstream source found that
OpenCode does not currently advertise the MCP elicitation capability or handle
nested `elicitation/create` requests.

This produced an important distinction:

> MCP standardizes tool communication, but it does not guarantee a universal
> approval user interface.

The obvious fallback was a terminal or separate local UI. That was rejected as
the primary product behavior because it breaks the session context. The user
would need to notice an external prompt, move to another place, and understand
that it belongs to the active agent operation. That does not feel like a
usable approval experience.

OpenCode does have relevant extension points:

- Plugins with `tool.execute.before` hooks.
- Custom tools that can replace the built-in `bash` tool.
- Plugin events for tool and permission activity.
- SDK access to session, logging, TUI, and permission APIs.

The current limitation is that a before-hook can inspect, mutate, or block a
tool call, but there is no documented plugin API for creating a native
permission request with a custom policy explanation. A replacement custom
`bash` tool can potentially call the tool context's `ask()` function, but it
would need to reimplement much of the native shell behavior.

## Reframing the Requirement

The requirement became stronger than "support multiple harnesses":

> Approval must appear in the active harness session, with the command, scope,
> and decision visible where the agent is running.

A terminal fallback does not satisfy that requirement.

This initially made the MCP-only architecture look questionable. MCP remains a
valid protocol interface, but MCP alone cannot supply the required experience
when a client does not implement elicitation.

## Universal Translation Layer Hypothesis

The current direction is not to build unrelated custom integrations. It is to
build one universal semantic layer with thin translation targets for each
harness.

```text
Universal tool and policy model
  - tool definitions
  - command classification
  - allow / ask / deny decisions
  - approval scopes
  - explanations
  - audit events
            |
            v
Translation layer
  +-> OpenCode plugin/custom-tool target
  +-> Claude Code PreToolUse target
  +-> MCP target
  +-> CLI-wrapper target
```

The policy and audit logic should exist once. Harness-specific code should be
thin adapters that translate the same semantic contract into the extension
mechanism each harness provides.

Conceptually, the adapter contract is:

```text
before_tool_call(input) -> allow | ask | deny
```

The adapter must also report capability gaps rather than silently pretending
that every harness supports identical behavior.

This is closer to a universal agent tool translation layer or agent control
plane compiler than to a single command broker. The gatekeeping use case is
the first policy package and experiment, not necessarily the whole product.

## Current Feasibility View

OpenCode can support a prototype adapter that observes and blocks native Bash
calls. It may support the required inline ask behavior by replacing `bash`
with a custom tool and using the custom tool's permission context, but this
must be tested. The simpler before-hook path does not appear to have enough
documented control over native approval prompts.

Claude Code provides a stronger-looking target through `PreToolUse` hooks,
which can inspect tool calls and return allow or deny decisions. Claude Code
also documents MCP elicitation events. The exact user experience and the
mapping of a dynamic policy decision to an inline ask still need validation.

The working hypothesis is therefore:

- A shared universal semantic layer is feasible.
- A completely harness-agnostic approval UI is not currently guaranteed.
- Thin generated or packaged adapters can preserve a common policy model.
- OpenCode and Claude Code are the first meaningful feasibility comparison.
- CLI wrappers remain a broad fallback, but not an enforcement boundary and
  not automatically a good approval UI.

## Open Questions

- Can an OpenCode custom `bash` tool call native approval in-session with the
  required command and policy explanation?
- Can the same canonical policy produce equivalent approval behavior in
  OpenCode and Claude Code?
- What is the smallest useful adapter contract shared by plugins, hooks, MCP,
  and wrappers?
- How should unsupported adapter capabilities be represented and surfaced?
- What should replace the temporary name "broker"?
- Should the first supported harness set be OpenCode and Claude Code, with
  other targets deferred until the translation model is proven?

## Current Position

The MCP-only implementation direction is paused. The next useful experiment is
not a full broker implementation. It is a small universal policy definition
and two harness targets that test the same three cases:

```text
git status       -> allow
git commit       -> ask
git reset --hard -> deny
```

The experiment should compare whether each harness can show the same intent,
decision, and explanation inside the active session while producing a common
audit event.

## OpenCode Feasibility Result

The OpenCode experiment was completed after the original MCP-only direction was
paused. OpenCode can host a Harness adapter by replacing its built-in `bash`
tool with a project-local custom tool that keeps the name and basic argument
shape.

The adapter calls OpenCode's custom-tool `context.ask()` API for Operation
requests whose Policy decision is `ask`. Manual TUI testing confirmed the
required normal path:

- A known safe command runs without an Approval request.
- An unknown command creates an Approval request in the active OpenCode TUI.
- Reject prevents execution.
- Allow once executes the command.
- A shell pipeline can also create an Approval request.
- A destructive Git operation is blocked before execution.

This resolved the main OpenCode feasibility question. Approval remains native
to the active Harness rather than moving to a separate terminal prompt.

The first manual result was misleading because the prototype configuration set
the outer `bash` permission to global `allow`. That caused OpenCode to approve
all custom-tool requests before `context.ask()` could reach the TUI. The fix
was to use granular permission rules: safe command patterns are explicitly
allowed, destructive patterns are denied, and the default is `ask`.

This was an important integration lesson: a Harness adapter has two policy
surfaces when it uses a Harness permission API. The outer Harness permission
configuration can override the adapter's own Policy behavior before the
adapter runs. The configuration must therefore be treated as part of the
adapter design, not as unrelated test setup.

## Shared Policy Model

The shared Policy model was then defined and implemented in `src/policy.ts`.
The first universal Operation is `command.execute`. An Operation request keeps
the Raw command, explicit working directory, optional Parsed command metadata,
and a correlation identity.

The agreed Policy behavior is:

- Known rules return `allow`, `ask`, or `deny`.
- Unknown or uncertain requests return `ask`.
- Matching decisions combine with `deny > ask > allow`.
- A `deny` decision is terminal and cannot be overridden by an Approval
  outcome.
- Invalid Policy configuration produces an unavailable Policy evaluation. A
  partial configuration is not used.
- Environment values are not inspected by the Policy or exposed in the
  approval surface.
- Rules use stable IDs, exact or prefix matching, optional working-directory
  conditions, and human-readable explanations.
- A future user-facing configuration may compile lists, patterns, and regular
  expressions into this internal rule model.

Composed shell commands are represented as one parent Operation request with
derived command parts. Each part is evaluated before execution and the results
are combined with the same precedence. A known pipeline with only safe parts
may be `allow`; a pipeline containing an `ask` part is `ask`; a pipeline
containing a `deny` part is `deny`. Unknown shell structure remains `ask`.

The Raw command remains the source of truth for display and audit. Parsed
metadata helps Policy classification but cannot replace the Raw command. A
conflict between the two produces `ask` instead of trusting the parsed data.

## OpenCode Adapter Implementation

The OpenCode adapter now uses the shared Policy evaluator instead of maintaining
a separate classifier. The current adapter demonstrates the translation path:

```text
OpenCode bash input
  -> Operation request
  -> shared Policy evaluation
  -> native OpenCode Approval request when needed
  -> Bun process execution when approved
  -> Operation result and in-memory Audit event
```

The prototype executes approved commands with `bash -lc` and captures standard
output, standard error, exit status, timeout state, Policy explanation, matched
rule, and correlation identity.

The implementation uses Node's built-in test runner with TypeScript type
stripping. The shared Policy suite currently contains 13 tests covering simple
commands, unknown commands, precedence, composed commands, uncertain parsing,
working-directory conditions, invalid configuration, metadata conflicts, and
correlation identity.

## Capability Gap: OpenCode Approval Outcomes

The shared vocabulary separates the Policy decision from the Approval outcome.
The intended Approval outcome statuses are `approved`, `denied`, `cancelled`,
and `unavailable`, with a separate scope such as `once` or `session`.

OpenCode version 1.18.25 exposes `context.ask()` as `Promise<void>`. The API
does not return the selected scope and does not distinguish a user's rejection
from an unavailable approval surface. The adapter therefore records successful
approval as `approved` and a failed request as `unavailable`, and documents the
loss of precision rather than inventing a result.

This is a useful example of the universal layer's purpose. The shared model can
describe a capability, but each Adapter capability must report when a Harness
cannot provide all of it. The translation layer should not claim parity that
the target does not support.

## Documentation and User-Facing Configuration

The project now has a root README, a beginner's guide, and a detailed current
state document. The documentation explains the concept, architecture, file
structure, installation, manual TUI checks, current capabilities, and limits.
Mermaid diagrams were added to show the high-level architecture and process
flow without requiring the reader to understand every implementation detail.

The internal Policy model intentionally remains small. User-facing lists,
command and path patterns, regular expressions, validation, and compilation to
internal Policy rules are tracked separately in issue 15. Keeping this work
separate avoids making the first evaluator depend on a configuration language
before its semantics have been tested.

## Current Frontier

The OpenCode target and canonical Policy model are complete as prototype
decisions. The next shared contracts are the normalized Execution contract and
the universal Audit contract. These contracts should be implemented without
making the shared layer depend on OpenCode-specific fields.

The next Harness comparison is Claude Code through its `PreToolUse` hook. A
CLI-wrapper target remains useful for Harnesses with weak extension APIs, but it
must continue to be described as a trust and visibility adapter rather than an
enforcement boundary.
