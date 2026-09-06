# Broker Runtime and MCP SDK Research

Date: 2026-09-04
Issue: [#2](https://github.com/Jumace/gaitcheck/issues/2)

## Scope

The first broker is a local, standalone MCP server launched by OpenCode over
stdio. It needs to execute subprocesses, expose a terminal approval path, be
packagable, and remain testable. This is a prototype convenience and trust
layer, not a security boundary, as described in `../PROJECT_PLAN.md`.

## Protocol constraints

The MCP stdio specification says the client launches the server as a
subprocess, the server reads JSON-RPC messages from stdin, and writes only
valid MCP messages to stdout. Logs may go to stderr. Therefore a human-facing
approval prompt must not be printed to stdout. The server should use a
controlling terminal or another UI channel, or use the host's approval flow;
it must not assume that stdio itself provides a UI.

Sources:

- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP server tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

MCP elicitation is a protocol mechanism for a server to request information
through the client. It does not mandate a UI, and the client controls the user
interaction. The 2025-06-18 form is also restricted to primitive fields and
must not be used for sensitive information. It is not a portable substitute
for a local terminal approval prompt. If the chosen OpenCode version supports
the relevant flow, elicitation can be reconsidered, but it must be treated as
an optional capability with decline/cancel handling.

Sources:

- [MCP elicitation, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)
- [MCP elicitation, current specification](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)

## Runtime comparison

| Option | Strengths for this broker | Costs and constraints |
| --- | --- | --- |
| **Node.js 24 LTS** | `node:child_process` provides stable asynchronous `spawn` and `execFile`, piped stdin/stdout/stderr, cwd/env control, AbortSignal cancellation, timeout, and exit events. `node:test` is stable and supports async tests. This is the closest fit to OpenCode's JavaScript/TypeScript ecosystem. | Must avoid `exec` or shell mode for untrusted command text; prefer an explicit executable plus argument vector. `node:test` does not replace integration tests that exercise the actual stdio process. Requires a Node installation unless packaged or invoked through a package manager. |
| **Python 3.10+** | The official Python SDK requires Python 3.10+, supports stdio, and includes a CLI and Inspector workflow. `asyncio.create_subprocess_exec` provides async process control, pipes, exit status, and cancellation via task/process management. Python offers a mature test ecosystem. | Adds a Python/uv environment to the OpenCode setup. Shell execution has the same injection risk, and asyncio subprocesses require careful pipe handling and timeouts. It is less aligned with OpenCode's native JavaScript packaging and command examples. |
| **Deno** | `Deno.Command` offers typed argument arrays, cwd/env, piped streams, status, signals, and explicit `allow-run` permission. The official TypeScript SDK states it runs on Deno. | Requires Deno permissions and a Deno-specific distribution path. The runtime permission model is useful defense-in-depth but does not replace broker policy or OpenCode configuration. It is a larger setup choice for a first OpenCode-targeted experiment. |

Sources:

- [Node.js child processes](https://nodejs.org/docs/latest-v24.x/api/child_process.html)
- [Node.js test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [Python asyncio subprocesses](https://docs.python.org/3/library/asyncio-subprocess.html)
- [Deno subprocess API](https://docs.deno.com/api/deno/subprocess/)
- [Official MCP SDKs](https://modelcontextprotocol.io/docs/2026-07-28/sdk.md)

## SDK comparison

### Official TypeScript SDK

The official SDK publishes server and client packages, includes a stdio
server transport, and documents a minimal server that connects with
`StdioServerTransport`. Its repository explicitly supports Node.js, Bun, and
Deno. The SDK's split packages and TypeScript types fit a small structured
tool such as `run_bash_command(command, cwd?)` and make the protocol boundary
easy to test independently from command execution.

Source: [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### Official Python SDK

The official Python SDK supports stdio, Streamable HTTP, and SSE, and its
client can launch a local server as a stdio subprocess. It provides a simple
typed server API and an in-memory client connection, which is attractive for
unit tests. Python is the strongest alternative if the project later needs
Python-native process, policy, or security libraries.

Source: [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)

## OpenCode fit and approval

OpenCode configures a local MCP server with a command array, cwd, environment,
and startup timeout. MCP tools then become available to the model. OpenCode's
permission system separately supports `allow`, `ask`, and `deny`, including
granular rules. This means the host can approve the broker tool call, but MCP
does not automatically provide selective approval for a subprocess launched
inside that tool.

Sources:

- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [OpenCode permissions](https://opencode.ai/docs/permissions/)

For the first experiment, choose one approval owner:

1. **Broker-side terminal approval:** open a controlling terminal (not MCP
   stdout), show the exact command, cwd, matched rule, and reason, and deny if
   no usable terminal or response exists. This supports selective policy
   without depending on undocumented host behavior, but is less portable to
   GUI, remote, and non-interactive invocations.
2. **OpenCode approval:** let OpenCode ask for every broker tool invocation,
   or use its permission rules. This is portable within OpenCode but cannot
   express the broker's internal allow/ask/deny decision without additional
   integration.

Do not silently fall back from an unavailable terminal prompt to execution.
The broker must preserve stdout for MCP messages, send diagnostics to stderr,
bound subprocess duration/output, and record the decision without secrets.

## Recommendation, subject to human decision

Prototype with **Node.js 24 LTS and the official TypeScript SDK v2**:

- Use `@modelcontextprotocol/server` and `StdioServerTransport`.
- Use `child_process.spawn` or `execFile` with an executable and argument
  array; do not pass untrusted command text to a shell.
- Use `AbortSignal`, explicit timeouts, bounded output, and separate stderr
  capture for broker diagnostics and child-process stderr.
- Use `node:test` for policy/unit tests and subprocess integration tests.
- Package an executable entry point with npm's `bin` field, or initially run a
  checked-out script from OpenCode's local MCP command array.
- Pin the SDK major/version line and record the MCP protocol version used by
  the implementation. The SDK main branch currently documents v2 alongside
  the 2026-07-28 specification; compatibility with the OpenCode version under
  test must be verified before implementation.

This recommendation is constrained by Node 24 availability, a deliberate
choice between broker-side terminal approval and OpenCode approval, and the
fact that neither MCP nor this runtime provides a security sandbox. Python is
the fallback if the project prioritizes Python-native policy/security tooling;
Deno is viable if explicit runtime permissions and a Deno-only setup are
acceptable. The human should make the final decision and then update the map.
