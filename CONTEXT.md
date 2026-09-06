# Agent Tool Translation

This context defines the shared language for translating agent tool calls into
policy decisions and harness-native integrations.

## Language

**Operation request**:
A normalized request for one agent action, beginning with `command.execute` in
the first prototype. _Avoid_: command request when the action is not a shell
command.

**Harness adapter**:
A target-specific integration that translates between a harness's extension
API and the shared operation contract. _Avoid_: bespoke integration, wrapper
when the target is not a CLI wrapper.

**Policy decision**:
The shared result of evaluating an operation request: `allow`, `ask`, or
`deny`. _Avoid_: permission result when referring to the universal layer.

**Policy rule**:
An internal rule with a stable identifier, operation, command match, optional
working-directory condition, decision, and explanation. The first prototype
supports exact and prefix matching. _Avoid_: user-facing policy syntax when
referring to the compiled internal rule.

**Policy evaluation**:
The result of applying Policy rules to an operation request. It is available
when a Policy decision exists and unavailable when the Policy configuration is
invalid or the request cannot be evaluated. _Avoid_: execution result.

**Approval request**:
The explanation and operation details a harness adapter presents when the
policy decision is `ask`. _Avoid_: approval prompt when referring to the
shared data rather than a harness UI.

**Approval outcome**:
The adapter's result after presenting an approval request: approved, denied,
cancelled, or unavailable, optionally with the selected scope and a human
note. Preset choices may accept an additional user-supplied explanation.
_Avoid_: policy decision, which happens before the human interaction.

**Execution core**:
The shared component that runs an approved operation, captures its result, and
emits the corresponding audit event. Harness adapters do not duplicate this
responsibility. _Avoid_: harness runner when referring to the shared behavior.

**Raw command**:
The exact command text received from a harness, retained for display and audit.
_Avoid_: normalized command when referring to the original input.

**Parsed command metadata**:
Optional executable, argument, and shell-mode information derived from a raw
command for policy classification. It is advisory and does not replace the
raw command. _Avoid_: executable command when parsing was uncertain.

**Execution context**:
The working directory and inherited process environment used for an operation.
The working directory is explicit; environment values are not part of the
approval or audit surface. _Avoid_: environment configuration when no override
is being requested.

**Operation result**:
The normalized outcome of an operation, including status, captured output,
termination details, policy and approval context, explanation, and correlation
identity. _Avoid_: harness response when referring to the shared result.

**Adapter capability**:
The declared set of operation, interception, approval, scope, explanation,
and audit behaviors a harness adapter can provide. Runtime failures may still
produce an unavailable outcome. _Avoid_: feature parity when capabilities
differ between harnesses.
