import { tool } from "@opencode-ai/plugin"

type Decision = "allow" | "ask" | "deny"

type AuditEvent = {
  command: string
  cwd: string
  decision: Decision
  rule: string
  reason: string
  approval: "not_required" | "approved" | "denied"
  exitCode?: number
  timedOut?: boolean
}

const audit: AuditEvent[] = []

function classify(command: string): {
  decision: Decision
  rule: string
  reason: string
} {
  const normalized = command.trim().replace(/\s+/g, " ")

  if (/^git\s+reset\s+--hard(?:\s|$)/.test(normalized) || /^git\s+clean\s+(-\S*\s+)*(-f|-fd|--force)(?:\s|$)/.test(normalized)) {
    return {
      decision: "deny",
      rule: "git destructive reset/clean",
      reason: "This can discard local work irreversibly.",
    }
  }

  if (/^(git\s+(commit|push)|gh\s+pr\s+(create|merge)|terraform\s+(apply|destroy)|kubectl\s+(apply|delete))(?:\s|$)/.test(normalized)) {
    return {
      decision: "ask",
      rule: "known consequential command",
      reason: "This can change repository or external state.",
    }
  }

  if (/^(git\s+(status|diff|log)|pwd|ls(?:\s|$)|printf\s|node\s+--version|npm\s+test(?:\s|$))/.test(normalized)) {
    return {
      decision: "allow",
      rule: "known read-only command",
      reason: "This is classified as ordinary read-only development work.",
    }
  }

  return {
    decision: "ask",
    rule: "unmatched command",
    reason: "The translation layer cannot classify this command confidently.",
  }
}

export default tool({
  description: "PROTOTYPE: policy-aware replacement for OpenCode's native bash tool",
  args: {
    command: tool.schema.string().describe("The exact shell command to run"),
    workdir: tool.schema.string().optional().describe("Working directory for the command"),
    timeout: tool.schema.number().optional().describe("Timeout in milliseconds"),
  },
  async execute(args, context) {
    const cwd = args.workdir ? args.workdir : context.directory
    const classification = classify(args.command)
    const event: AuditEvent = {
      command: args.command,
      cwd,
      decision: classification.decision,
      rule: classification.rule,
      reason: classification.reason,
      approval: "not_required",
    }

    if (classification.decision === "deny") {
      audit.push(event)
      return {
        title: "Command denied",
        output: `Denied: ${classification.reason}\nRule: ${classification.rule}`,
        metadata: { auditCount: audit.length, decision: event },
      }
    }

    if (classification.decision === "ask") {
      try {
        await context.ask({
          permission: "bash",
          patterns: [args.command],
          always: [args.command],
          metadata: {
            command: args.command,
            cwd,
            rule: classification.rule,
            reason: classification.reason,
            prototype: true,
          },
        })
        event.approval = "approved"
      } catch {
        event.approval = "denied"
        audit.push(event)
        return {
          title: "Command not executed",
          output: `Approval denied or unavailable: ${classification.reason}`,
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
