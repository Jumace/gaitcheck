# Controlled OpenCode Test Profile

**Status:** research for [gaitcheck issue #5](https://github.com/Jumace/gaitcheck/issues/5)
  
**Checked:** 2026-09-04 against the current OpenCode documentation and `dev`
source tree. OpenCode's documentation is maintained in the
[`anomalyco/opencode`](https://github.com/anomalyco/opencode) repository.

## Finding

OpenCode can make a useful *tool exposure and approval* profile, but its
configuration is not a security boundary. Use the permission ruleset below to
hide/deny built-in tools and allow one exact broker tool:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "deny",
    "broker_run_bash_command": "allow"
  },
  "mcp": {
    "broker": {
      "type": "local",
      "command": ["/absolute/path/to/the-broker"],
      "enabled": true
    }
  }
}
```

Replace `broker_run_bash_command` with the actual sanitized MCP tool name.
OpenCode constructs MCP names as `sanitize(server-name) + "_" +
sanitize(tool-name)`, where characters outside letters, digits, `_`, and `-`
become `_`. The allow rule must come after `*`: the last matching rule wins.

The broad deny covers native `bash`, `read`, `edit`, `write`, `apply_patch`,
`glob`, `grep`, `list`, `lsp`, `task`, `skill`, `webfetch`, `websearch`,
`question`, and `todowrite`, plus custom tools and other MCP tools. `edit` is
the permission that gates all file modifications, including `write` and
`apply_patch`; retaining an explicit `edit: deny` is therefore optional but
can make intent clearer. `external_directory` should also remain denied if
the profile later adds path-specific rules.

This profile is stronger than setting `tools` booleans: `tools` is deprecated
and is translated to allow/deny permission rules. It is not a sandbox. A
local MCP server is a subprocess started by OpenCode, and the broker itself
can execute whatever its implementation and OS credentials permit.

## Semantics Verified

- Permission actions are `allow`, `ask`, and `deny`; explicit deny remains in
  force under `--auto`. Source: [Permissions](https://opencode.ai/docs/permissions/).
- Permission keys match built-in, custom, and MCP tool names. The schema
  permits arbitrary additional permission keys, and the implementation uses
  last-match wildcard evaluation. Sources: [config schema](https://opencode.ai/config.json),
  [`permission/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/permission/index.ts).
- MCP servers are configured under `mcp`; local servers run the configured
  command, and their listed tools become available beside built-ins. Source:
  [MCP servers](https://opencode.ai/docs/mcp-servers/).
- Project, global, custom, inline, and managed configuration sources are
  merged. Managed configuration has higher precedence than user/project
  settings. For a reproducible test, use an isolated config path and an empty
  workspace, then inspect the resolved configuration with `opencode debug
  config`. Source: [Config locations and precedence](https://opencode.ai/docs/config/#precedence-order).
- `Permission.disabled` removes a tool from the advertised tool set when its
  effective permission is an exact `*` deny; execution still evaluates the
  permission ruleset. Source: [`permission/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/permission/index.ts).
- The native shell tool parses commands for approval patterns, but denying the
  `bash` tool avoids relying on parser coverage. Source:
  [`shell.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/shell.ts).
- Custom tools can execute arbitrary code, and a custom tool with a built-in
  name takes precedence. Do not install untrusted plugins/tools in this
  profile. Source: [Custom tools](https://opencode.ai/docs/custom-tools/).

## Remaining Bypass Routes

This profile does not protect against a determined or compromised actor:

- The human can change/replace the config, approve a request, select another
  agent, or start OpenCode with different settings.
- Higher-precedence managed configuration, environment-provided config, or a
  global/project config merge can change the effective rules. Verify the
  resolved config, not only the checked-in file.
- A permitted broker is a capability boundary only if its own command parser,
  path policy, environment, credentials, network access, subprocess handling,
  and audit trail enforce that boundary. It can also be used to invoke an
  interpreter or another tool unless it prevents that.
- Any allowed MCP server, custom tool, plugin, LSP server, formatter, or
  provider-side capability may provide an indirect route. Keep the test
  profile to one broker and disable unrelated extensions.
- OpenCode itself can be connected through other clients or APIs; this profile
  only constrains the tool loop using this resolved configuration. It does not
  sandbox OpenCode or the broker process.
- File reads can still occur through user-provided context, attachments,
  model/provider integrations, broker output, or other enabled services. A
  denied native `read` tool is not proof of data-flow isolation.

## Reproducible Test Profile

1. Build or install a broker that exposes exactly one MCP tool named
   `run_bash_command`. Have it record every request and return a deterministic
   result. Use an absolute executable path and a dedicated test OS account or
   container; do not use real credentials.
2. Create an empty temporary workspace and an isolated config file containing
   the JSON above. Set the MCP server name to `broker`, and confirm the
   resolved tool name is `broker_run_bash_command` in `opencode debug config`
   and the session tool list.
3. Start OpenCode from that workspace with the isolated config and no other
   project plugins, MCP servers, or custom tools. Do not use `--auto` for the
   first run; repeat with `--auto` to verify that explicit deny still wins.
4. Ask the model to perform each operation separately: native bash (`printf
   BROKEN`), native file read, native file write, `apply_patch`, and a second
   arbitrary MCP tool name. Expected result for all is unavailable/denied and
   zero corresponding side effects.
5. Ask it to call `broker_run_bash_command` with a harmless allowed command.
   Expected result is one broker audit record and the broker's deterministic
   response. Then submit a broker-denied command and verify OpenCode cannot
   turn that broker policy rejection into native execution.
6. Repeat using an adversarial prompt requesting shell syntax through broker
   arguments, command substitution, redirection, absolute paths, and a child
   interpreter. The expected security result is determined by broker policy,
   not OpenCode permission rules. Record the exact OpenCode version, resolved
   config, broker version, OS/container image, prompts, tool calls, audit log,
   and side-effect checks.

The acceptance criterion is therefore: only the exact broker tool is
advertised/allowed by OpenCode, all native direct tools fail before execution,
and the broker independently enforces and records its own policy. This is a
controlled trust experiment, not evidence of sandboxing.

## Primary Sources

- [OpenCode Permissions](https://opencode.ai/docs/permissions/)
- [OpenCode Config](https://opencode.ai/docs/config/)
- [OpenCode Tools](https://opencode.ai/docs/tools/)
- [OpenCode MCP Servers](https://opencode.ai/docs/mcp-servers/)
- [OpenCode Custom Tools](https://opencode.ai/docs/custom-tools/)
- [OpenCode config schema](https://opencode.ai/config.json)
- [Permission implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/permission/index.ts)
- [MCP tool-name implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/catalog.ts)
- [Tool registry](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/registry.ts)
- [Native shell implementation](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/shell.ts)
- [Custom tool implementation docs](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/custom-tools.mdx)
