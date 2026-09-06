import { tool } from "@opencode-ai/plugin"
import { evaluatePolicy } from "../../../../src/policy.ts"

type AuditEvent = {
  command: string
  cwd: string
  decision: "allow" | "ask" | "deny"
  rule: string
  reason: string
  approval: "not_required" | "approved" | "denied"
  exitCode?: number
  timedOut?: boolean
}

const policy = {
  rules: [
    {
      id: "git-destructive",
      operation: "command.execute",
      executable: "git",
      arguments: ["reset", "--hard"],
      match: "prefix",
      decision: "deny",
      explanation: "This can discard local work irreversibly.",
    },
    {
      id: "git-clean-destructive",
      operation: "command.execute",
      executable: "git",
      arguments: ["clean"],
      match: "prefix",
      decision: "deny",
      explanation: "This can remove untracked local work.",
    },
    ...[
      ["git-commit", "git", ["commit"]],
      ["git-push", "git", ["push"]],
      ["gh-pr-create", "gh", ["pr", "create"]],
      ["gh-pr-merge", "gh", ["pr", "merge"]],
      ["terraform-apply", "terraform", ["apply"]],
      ["terraform-destroy", "terraform", ["destroy"]],
      ["kubectl-apply", "kubectl", ["apply"]],
      ["kubectl-delete", "kubectl", ["delete"]],
    ].map(([id, executable, commandArguments]) => ({
      id,
      operation: "command.execute" as const,
      executable,
      arguments: commandArguments,
      match: "prefix" as const,
      decision: "ask" as const,
      explanation: "This can change repository or external state.",
    })),
    {
      id: "git-status",
      operation: "command.execute",
      executable: "git",
      arguments: ["status"],
      decision: "allow",
      explanation: "This reads repository state.",
    },
    {
      id: "git-diff",
      operation: "command.execute",
      executable: "git",
      arguments: ["diff"],
      match: "prefix",
      decision: "allow",
      explanation: "This reads repository changes.",
    },
    {
      id: "git-log",
      operation: "command.execute",
      executable: "git",
      arguments: ["log"],
      match: "prefix",
      decision: "allow",
      explanation: "This reads repository history.",
    },
    {
      id: "pwd",
      operation: "command.execute",
      executable: "pwd",
      decision: "allow",
      explanation: "This reads the current directory.",
    },
    {
      id: "ls",
      operation: "command.execute",
      executable: "ls",
      match: "prefix",
      decision: "allow",
      explanation: "This reads directory contents.",
    },
    {
      id: "printf",
      operation: "command.execute",
      executable: "printf",
      match: "prefix",
      decision: "allow",
      explanation: "This produces local command output.",
    },
    {
      id: "node-version",
      operation: "command.execute",
      executable: "node",
      arguments: ["--version"],
      decision: "allow",
      explanation: "This reads the Node.js version.",
    },
    {
      id: "npm-test",
      operation: "command.execute",
      executable: "npm",
      arguments: ["test"],
      match: "prefix",
      decision: "allow",
      explanation: "This runs the project test command.",
    },
  ],
}

const audit: AuditEvent[] = []

export default tool({
  description: "PROTOTYPE: policy-aware replacement for OpenCode's native bash tool",
  args: {
    command: tool.schema.string().describe("The exact shell command to run"),
    workdir: tool.schema.string().optional().describe("Working directory for the command"),
    timeout: tool.schema.number().optional().describe("Timeout in milliseconds"),
  },
  async execute(args, context) {
    const cwd = args.workdir ? args.workdir : context.directory
    const evaluation = evaluatePolicy({
      operation: "command.execute",
      rawCommand: args.command,
      workingDirectory: cwd,
    }, policy)
    const decision = evaluation.status === "available" ? evaluation.decision : "deny"
    const rule = evaluation.status === "available" ? evaluation.matchedRuleIds.join(",") || "unmatched" : "policy-unavailable"
    const reason = evaluation.explanation
    const event: AuditEvent = {
      command: args.command,
      cwd,
      decision,
      rule,
      reason,
      approval: "not_required",
    }

    if (evaluation.status === "unavailable" || decision === "deny") {
      audit.push(event)
      return {
        title: evaluation.status === "unavailable" ? "Policy unavailable" : "Command denied",
        output: `${evaluation.status === "unavailable" ? "Unavailable" : "Denied"}: ${reason}\nRule: ${rule}`,
        metadata: { auditCount: audit.length, decision: event },
      }
    }

    if (decision === "ask") {
      try {
        await context.ask({
          permission: "bash",
          patterns: [args.command],
          always: [args.command],
          metadata: {
            command: args.command,
            cwd,
            rule,
            reason,
            prototype: true,
          },
        })
        event.approval = "approved"
      } catch {
        event.approval = "denied"
        audit.push(event)
        return {
          title: "Command not executed",
          output: `Approval denied or unavailable: ${reason}`,
          metadata: { auditCount: audit.length, decision: event },
        }
      }
    }

    const child = Bun.spawn(["bash", "-lc", args.command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal: context.abort,
    })
    const timeoutMs = args.timeout ?? 120_000
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    const exitCode = await child.exited
    clearTimeout(timer)
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    event.exitCode = exitCode
    event.timedOut = timedOut
    audit.push(event)

    return {
      title: args.command,
      output: `${stdout}${stderr ? `\n${stderr}` : ""}` || "(no output)",
      metadata: {
        auditCount: audit.length,
        decision: event,
        timeout: timeoutMs,
      },
    }
  },
})
