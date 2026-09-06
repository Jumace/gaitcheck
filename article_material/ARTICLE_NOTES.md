# Why AI Agents Overstep Explicit Boundaries

Working notes for a future article.

## Starting Observation

The original problem was not that an agent is intentionally malicious. The problem is that an agent tries to complete the larger task it infers from the user's request.

A user may ask for a small code change. The agent may interpret completion as including:

- Committing the change.
- Pushing it to a remote repository.
- Opening or merging a pull request.
- Updating a ticket.
- Deploying the result.
- Changing cloud or cluster state.

The uncomfortable result is that the user starts working in tiny increments because they do not trust the agent with a larger step. If they grant a small amount of autonomy, the agent may take a much larger action than expected. The user then spends time reviewing and reverting consequences instead of reviewing the intended work.

The desired improvement is not an unbreakable security boundary. It is a way to make agent actions more predictable and easier to trust.

## The Question

How can we make it easier to let an agent do more without requiring the user to supervise every command manually?

The useful framing became:

> Build a trust governor that introduces friction at consequential boundaries while leaving ordinary work fast.

This is different from claiming that users can be protected from their own configuration mistakes or from a determined attacker.

## First Idea: CLI Wrappers

The first concrete idea was to put wrappers earlier in `PATH` than selected command-line tools.

The wrappers would inspect commands such as `git`, `gh`, `aws`, `kubectl`, and `terraform`, then apply an `allow`, `ask`, or `deny` policy.

Example behavior:

```text
git status       -> allow
git diff         -> allow
git commit       -> ask
git push         -> ask
git reset --hard -> deny
```

This was attractive because it is small, portable across harnesses, and does not require a full VM or container. It also directly tests whether an interruption before a risky action makes the agent feel safer to use.

### Why wrappers are useful

- They work with ordinary CLI workflows.
- They can be shared by harnesses that launch normal executables.
- They can record the command and decision.
- They are cheap to prototype.
- They preserve existing tools instead of requiring typed replacements for everything.

### Why wrappers are not enough

PATH is a lookup convention, not an authorization boundary. A process may use an absolute executable path, another executable, a script, an interpreter, a library, a plugin, or a direct API call.

Even command classification is difficult. These commands may all have similar effects:

```bash
git push
./release.sh
python release.py
make publish
npm run deploy
```

The wrapper is therefore valuable as a trust layer, but it should not claim to control everything the agent can do.

## Research Detour: Existing Sandboxes

The research did not show that nothing exists. It showed that existing solutions are distributed across different layers.

### Harness permissions

OpenCode, Claude Code, and Codex have permission or approval systems. These are good at understanding agent-facing actions and asking a human for confirmation. Their weakness is that they are integrated into individual harnesses and are not automatically a universal runtime boundary.

### Local operating-system controls

Linux provides primitives such as Landlock, seccomp, namespaces, and bubblewrap. macOS provides Seatbelt and App Sandbox mechanisms. These can enforce restrictions, but they do not naturally understand that `git push` deserves a human question.

They enforce capability. They do not provide the complete trust-oriented user experience.

### Containers and microVMs

Docker Sandboxes, E2B, Vercel Sandbox, Daytona, and similar systems provide isolated execution environments. MicroVM-backed systems can provide stronger isolation than ordinary containers, and some offer network firewalls or credential brokering.

Their weakness for this particular experiment is that they add runtime, lifecycle, platform, and setup complexity before we know whether selective approval is useful to the user.

### Agent runtimes

OpenHands demonstrates a modular runtime approach, but the strength of its isolation depends on the selected provider. A Docker runtime is not the same boundary as a process runtime or a VM-backed runtime.

### Research conclusion

The opportunity is not to invent sandboxing. It is to explore a portable policy and mediation layer that can eventually sit above different enforcement mechanisms.

## Second Idea: An MCP OS Interface

The next idea was to give the agent an MCP server for operating-system interaction and configure the harness not to use its native OS tools.

The first interpretation was a set of narrow tools:

```text
read_project_file
git_status
run_tests
git_commit
git_push
```

Narrow tools make intent explicit. A `git_push` request is easier to classify than an arbitrary shell string.

The more relevant refinement was a single generic tool:

```text
run_bash_command(command, cwd?)
```

The MCP server would run the command, apply a blacklist or risk policy, ask for approval when needed, and pass everything else through.

## Why The Single MCP Command Tool Is Promising

For the stated threat model, the MCP tool is a plausible first prototype and may be more useful than a collection of narrow tools.

It offers:

- One visible route for normal system interaction.
- A consistent place for approval and auditing.
- A harness-independent interface.
- Existing CLI flexibility.
- The ability to show the user exactly what the agent wants to do.

This could make the user more comfortable granting the agent larger tasks without pretending that the server is a secure sandbox.

## Why MCP Alone Does Not Force Anything

MCP is an interface protocol. A local MCP server is still an ordinary process. The protocol does not revoke its filesystem, process, or network privileges.

If the harness still has native shell access, it can potentially bypass the MCP server. If another unrestricted MCP server is enabled, that server is another route. If the user changes the configuration, the intended constraint disappears.

MCP roots and tool annotations are useful information and convention, but they are not kernel-enforced boundaries. MCP's own security guidance treats local servers as code that may have direct access to the user's system and recommends sandboxing them.

This does not invalidate the idea because bypass resistance is not the first goal. It simply defines the boundary honestly:

> MCP can mediate the normal path only when the harness is configured to use it. OS-level isolation is required to technically remove alternative paths.

## The Three Levels Of Control

### Behavioral control

Tell the agent to use the MCP tool. This is the weakest level and depends on the model following the instruction.

### Harness configuration

Deny native `bash`, file tools, and other direct tools in OpenCode. Allow the command-broker MCP tool. This is the appropriate level for the first prototype.

### Runtime enforcement

Run the harness in a restricted container, microVM, or OS sandbox and keep the broker as the controlled bridge to host resources. This is the later enforcement path.

The important distinction is:

```text
harness permission = what the agent is allowed to request
MCP broker        = how the request is mediated
OS sandbox        = what the resulting process can physically do
```

## Why Start With OpenCode Configuration Only

The first experiment should not answer every security question at once. It should answer whether the mediation experience is useful.

OpenCode configuration is enough to test:

- Whether the agent can work through one MCP command tool.
- Whether read-only commands remain frictionless.
- Whether risky commands are recognized at the right moments.
- Whether approval prompts are understandable.
- Whether the user feels more willing to delegate larger steps.
- Whether the audit trail helps explain what happened.

Adding sandboxing immediately would mix those questions with container setup, filesystem mounts, network behavior, credential handling, platform differences, and runtime failures.

The first version should therefore be deliberately cooperative and honest about its limits.

## What Was Abandoned Or Deferred

### Shell aliases

Aliases are mainly an interactive-shell feature. Non-interactive harnesses, scripts, other shells, and direct executable paths can bypass them. Wrappers or MCP mediation are more promising.

### PATH wrappers as the final architecture

Wrappers remain a possible adapter, especially when a harness cannot disable native shell tools. They were not selected as the only long-term architecture because PATH does not provide a reliable universal interception point.

### Narrow MCP tools as the only interface

Narrow tools provide excellent semantic clarity, but requiring a separate tool for every operating-system action may become cumbersome and may not match existing development workflows. A single command tool is better for testing whether mediation itself helps, provided its policy and uncertainty are visible.

### MCP as a security boundary

MCP cannot enforce what the server process is allowed to do. It remains an interface and mediation layer unless paired with OS-level restrictions.

### Full sandbox or microVM first

These are important future options, not the first experiment. They solve stronger problems than the initial trust question and would make the first result harder to interpret.

### Direct API control as a first-version focus

Direct APIs matter, especially for cloud and repository tools, but they complicate the first experiment. They should remain a known limitation rather than being declared irrelevant forever.

## Open Design Questions

- Should unmatched commands be allowed, asked, or denied by default?
- How should shell chains, redirects, substitutions, and scripts be classified?
- How should a local MCP server obtain human approval without corrupting the stdio protocol?
- Should approval last for one invocation, a session, or a persistent policy pattern?
- How much command output should be logged?
- How should secrets in commands and environment variables be redacted?
- Which command families create enough value to justify initial rules?
- Does the same MCP server feel useful in another harness?
- At what point does the convenience layer need runtime enforcement?

## Likely Article Argument

The eventual article should not claim that a clever MCP server solves agent safety. A more accurate argument is:

1. Agent overreach is often a trust and workflow problem before it is a hostile-security problem.
2. Existing harness permissions, sandboxes, and runtimes each solve part of the problem.
3. A mediation layer can make consequential intent visible without forcing every action through a manual checklist.
4. MCP is a practical interface for that experiment, but not a technical enforcement boundary.
5. Starting with OpenCode configuration keeps the experiment small and makes the result easier to understand.
6. If the interaction proves useful, the same broker can later connect to OS sandboxing, network controls, and credential brokering.

## Sources

- OpenCode permissions: https://opencode.ai/docs/permissions/
- OpenCode MCP servers: https://opencode.ai/docs/mcp-servers/
- MCP architecture: https://modelcontextprotocol.io/specification/2025-06-18/architecture/index
- MCP tools and security: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP roots: https://modelcontextprotocol.io/specification/2025-06-18/client/roots
- MCP local server security: https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
- MCP stdio transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- Claude Code permissions: https://code.claude.com/docs/en/permissions
- Claude Code sandboxing: https://code.claude.com/docs/en/sandboxing
- Codex sandboxing: https://developers.openai.com/codex/sandboxing/
- Codex permissions: https://developers.openai.com/codex/permissions/
- OpenHands sandbox overview: https://docs.openhands.dev/openhands/usage/sandboxes/overview.md
- E2B network controls: https://docs.e2b.dev/network/internet-access
- Vercel Sandbox firewall: https://vercel.com/docs/sandbox/concepts/firewall
- Daytona network limits: https://www.daytona.io/docs/en/network-limits
- Docker Sandboxes: https://docs.docker.com/ai/sandboxes/
- Docker Sandboxes security: https://docs.docker.com/ai/sandboxes/security/
- Linux Landlock: https://docs.kernel.org/userspace-api/landlock.html
- Linux seccomp: https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html
- bubblewrap: https://github.com/containers/bubblewrap/blob/main/README.md
- sudoers: https://www.sudo.ws/docs/man/sudoers.man/
- GitHub OIDC: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- SPIFFE Workload API: https://spiffe.io/docs/latest/spiffe-specs/spiffe_workload_api/
