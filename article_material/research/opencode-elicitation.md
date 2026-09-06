# OpenCode MCP Elicitation Compatibility

**Issue:** [Jumace/gaitcheck#9](https://github.com/Jumace/gaitcheck/issues/9)
**Checked:** 2026-09-05
**OpenCode checked:** upstream `dev` source; package version `1.18.28`. The
installed CLI reports `1.18.25` with `opencode --version`.

## Decision

Current OpenCode does **not** support MCP elicitation as a host capability.
It does not advertise `elicitation` during MCP initialization and does not
install an `elicitation/create` request handler. A local stdio MCP server may
connect and expose tools, but a tool that sends a nested
`elicitation/create` request cannot obtain an OpenCode UI answer and should be
treated as unsupported.

This is source verification, not a successful end-to-end elicitation test:
the installed CLI has no documented elicitation switch or UI, and OpenCode's
MCP implementation contains no elicitation handler or test. The relevant
upstream source itself records elicitation as a future/commented capability:
[`CLIENT_OPTIONS` in `mcp/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/index.ts#L35-L49).

## Evidence

OpenCode constructs its MCP client with `capabilities` containing only
`roots: {}`. The `sampling` and `elicitation` entries are commented out, with
the elicitation comment linking to OpenCode issue #23066. The same file only
registers a `roots/list` handler; there is no `setRequestHandler` call for
`elicitation/create`.

OpenCode's local configuration launches the command as a subprocess over
`StdioClientTransport`; this is the supported local-server path described in
the [MCP server documentation](https://opencode.ai/docs/mcp-servers/#local) and
implemented in [`connectLocal`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/index.ts#L253-L285).
The MCP tools are adapted to OpenCode tools and call only
`client.callTool(...)` in [`catalog.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/catalog.ts#L25-L60),
then wrapped with the ordinary MCP permission approval in
[`session/tools.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/tools.ts#L250-L310).
That approval is for the outer tool invocation; it is not an elicitation UI
and cannot express a nested server question.

The [official TypeScript SDK `Client`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/client.ts)
states that server-initiated sampling, elicitation, and roots requests require
`setRequestHandler`. It also validates `elicitation/create` requests and
responses when such a handler exists. OpenCode supplies neither the capability
nor the handler.

## Supported Protocol Surface

The following is what a compatible host would need to support, not what
OpenCode currently supports.

### Capability and transport

For the 2025-11-25 protocol, a client must advertise the relevant capability in
initialization:

```json
{ "capabilities": { "elicitation": { "form": {}, "url": {} } } }
```

An empty `elicitation: {}` means form support for backward compatibility. Form
and URL are separate mode capabilities. The protocol is transport agnostic;
over stdio the client launches the server, reads JSON-RPC from stdout, and
writes responses to stdin. The server must write no UI text to stdout. Sources:
[MCP elicitation, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
and [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

### Form mode

`elicitation/create` carries `mode: "form"` (or omitted for legacy clients), a
human-readable `message`, and a `requestedSchema`. The schema is a flat object
whose properties are primitive fields: string, number/integer, boolean, and
single- or multi-select string enums. Supported constraints include titles,
descriptions, defaults, string length, the formats `email`, `uri`, `date`, and
`date-time`, numeric min/max, and enum values. Nested objects, arrays of
objects, and arbitrary JSON Schema are not supported. Accepted responses carry
`content` matching the schema.

### URL mode

`mode: "url"` carries `message`, a valid `url`, and a unique
`elicitationId`. It is for sensitive or out-of-band flows; credentials and
form contents must not pass through the MCP client. The client must show the
full URL, obtain explicit consent, and not prefetch or automatically open it.
The server may later send
`notifications/elicitation/complete` with the same ID. That notification and
the URL-required error (`-32042`) are in the 2025-11-25 surface.

### Actions

The handler returns exactly one of:

- `accept`, optionally with form `content`.
- `decline`, normally without content.
- `cancel`, normally without content.

The protocol requires clients to provide clear server identity, review and
edit controls for form input, and decline/cancel controls. It does not mandate
a particular UI. Sources: [MCP elicitation response actions and UI
requirements](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
and the official SDK's [elicitation example](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/elicitation/client.ts).

## Nested Requests, Cancellation, and Timeouts

The nested request is expected to occur while `tools/call` is still pending.
The official SDK dispatches it to the registered `elicitation/create` handler;
its handler wrapper rejects a mode that was not declared and validates both
the request and the returned result. Without a handler, the SDK cannot obtain
an answer. OpenCode has no replacement callback, event, dialog, or URL flow,
so the call fails rather than pausing for a human response.

OpenCode passes the model/tool abort signal to `client.callTool` and passes the
configured MCP timeout through the SDK adapter. This gives ordinary outer MCP
tool calls cancellation and timeout behavior, but it does not create
elicitation behavior. There is no OpenCode-specific elicitation timeout,
pending-request state, or UI cancellation mapping. A server must therefore
handle the failed outer call and must not execute a protected operation after
an unavailable interaction. OpenCode's MCP connection/listing timeout fallback
is implemented separately (`DEFAULT_TIMEOUT = 30_000`) and is not a nested
elicitation timeout. See [`convertTool`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/catalog.ts#L25-L60)
and [OpenCode MCP options](https://opencode.ai/docs/mcp-servers/#options).

The 2026-07-28 MCP revision changes the wire model: server input is carried in
an `input_required` result and the official SDK can auto-fulfil embedded
`elicitation/create` requests through the same registered handler. OpenCode's
client is configured with no elicitation handler and no `inputRequired` driver
configuration, so this newer route is unsupported as well. OpenCode's source
also uses the legacy SDK import/API and does not opt into that modern flow.
See the official SDK's [client input-required implementation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/client.ts)
and [2026-07-28 elicitation specification](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation).

## Precise Fallback

The broker must feature-detect this at connection time from the client's
initialization capabilities. If `elicitation` is absent, it must never send a
workflow that depends on nested `elicitation/create`. For command approval,
use one of these explicit paths instead:

1. Prefer OpenCode's ordinary permission flow: expose the broker operation as
   an MCP tool and let OpenCode ask permission for that outer tool call. The
   broker then executes only after its own policy accepts the call.
2. If approval must happen inside the broker, use a controlling terminal or
   another out-of-band UI, never MCP stdout. If no usable approval channel is
   available, return an MCP tool error with the stable message
   `interactive approval unavailable; command not executed` and do not run the
   command.

There is no safe automatic fallback to `accept`, to a guessed answer, or to
silent execution. A future OpenCode integration can replace this fallback only
after it advertises the required mode and supplies a real handler/UI for
accept, decline, cancel, abort, and timeout.

## Sources

- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers/)
- [OpenCode permissions](https://opencode.ai/docs/permissions/)
- [OpenCode MCP client source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/index.ts)
- [OpenCode MCP catalog source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/mcp/catalog.ts)
- [OpenCode session tool source](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/tools.ts)
- [MCP elicitation specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- [MCP stdio transport specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP elicitation specification, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- [Official MCP TypeScript SDK client](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/client.ts)
- [Official MCP TypeScript SDK elicitation example](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/elicitation/client.ts)
