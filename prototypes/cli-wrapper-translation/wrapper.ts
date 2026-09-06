import { appendFileSync, readSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { evaluatePolicy, type PolicyDecision, type PolicyRule } from "../../src/policy.ts"

// PROTOTYPE: a PATH adapter can mediate a named executable, not every way to
// produce the same side effect.
const wrapperDirectory = dirname(fileURLToPath(import.meta.url))
const executable = process.env.GAITCHECK_WRAPPED_COMMAND ?? basename(process.argv[1] ?? "")
const args = process.argv.slice(2)
const rawCommand = [executable, ...args].join(" ")
const correlationId = crypto.randomUUID()
const cwd = process.cwd()

const policy = { rules: rules() }
const evaluation = evaluatePolicy({
  operation: "command.execute",
  rawCommand,
  workingDirectory: cwd,
  correlationId,
}, policy)
const decision: PolicyDecision = evaluation.status === "available" ? evaluation.decision : "deny"
const ruleId = evaluation.status === "available" ? evaluation.matchedRuleIds.join(",") || "unmatched" : "policy-unavailable"
const event = {
  type: "command.audit",
  correlationId,
  adapter: "cli-wrapper",
  command: rawCommand,
  executable,
  args,
  cwd,
  decision,
  rule: ruleId,
  explanation: evaluation.explanation,
  approval: "not_required" as "not_required" | "approved" | "denied" | "unavailable",
}

if (evaluation.status === "unavailable" || decision === "deny") {
  event.approval = evaluation.status === "unavailable" ? "unavailable" : "denied"
  record(event)
  process.stderr.write(`${event.approval === "denied" ? "Denied" : "Unavailable"}: ${evaluation.explanation}\n`)
  process.exitCode = 1
} else if (decision === "ask" && !approve(event.explanation)) {
  event.approval = "denied"
  record(event)
  process.stderr.write(`Not executed: ${event.explanation}\n`)
  process.exitCode = 1
} else {
  event.approval = decision === "ask" ? "approved" : "not_required"
  const realExecutable = findRealExecutable(executable)
  if (!realExecutable) {
    event.approval = "unavailable"
    record(event)
    process.stderr.write(`Unavailable: could not find the real ${executable} executable.\n`)
    process.exitCode = 1
  } else {
    const result = spawnSync(realExecutable, args, { cwd, stdio: "inherit" })
    Object.assign(event, { exitCode: result.status, signal: result.signal ?? undefined })
    record(event)
    process.exitCode = result.status ?? 1
  }
}

function approve(explanation: string): boolean {
  if (process.env.GAITCHECK_APPROVAL === "allow") return true
  if (process.env.GAITCHECK_APPROVAL === "deny") return false
  process.stderr.write(`Approval required: ${explanation}\nAllow this command once? [y/N] `)
  return (process.stdin.isTTY ? readLine() : "").toLowerCase() === "y"
}

function readLine(): string {
  const buffer = Buffer.alloc(1)
  let answer = ""
  while (true) {
    const count = readSync(process.stdin.fd, buffer, 0, 1, null)
    if (!count || buffer[0] === 10) return answer.trim()
    answer += buffer.toString("utf8", 0, count)
  }
}

function findRealExecutable(name: string): string | undefined {
  const pathEntries = (process.env.PATH ?? "").split(":")
  for (const entry of pathEntries) {
    if (entry === wrapperDirectory || entry === join(wrapperDirectory, "bin")) continue
    const candidate = join(entry || ".", name)
    const result = spawnSync("test", ["-x", candidate])
    if (result.status === 0) return candidate
  }
}

function record(event: object) {
  const line = `${JSON.stringify(event)}\n`
  if (process.env.GAITCHECK_AUDIT_FILE) appendFileSync(process.env.GAITCHECK_AUDIT_FILE, line)
  else process.stderr.write(`AUDIT ${line}`)
}

function rules(): PolicyRule[] {
  return [
    makeRule("git-status", "git", ["status"], "allow", "This reads repository state.", "prefix"),
    makeRule("git-diff", "git", ["diff"], "allow", "This reads repository changes.", "prefix"),
    makeRule("git-commit", "git", ["commit"], "ask", "This changes repository history.", "prefix"),
    makeRule("git-push", "git", ["push"], "ask", "This changes a remote repository.", "prefix"),
    makeRule("gh-pr-create", "gh", ["pr", "create"], "ask", "This creates external repository state.", "prefix"),
    makeRule("terraform-apply", "terraform", ["apply"], "ask", "This changes infrastructure state.", "prefix"),
    makeRule("kubectl-delete", "kubectl", ["delete"], "ask", "This changes cluster state.", "prefix"),
    makeRule("git-reset-hard", "git", ["reset", "--hard"], "deny", "This can discard local work irreversibly.", "prefix"),
  ]
}

function makeRule(id: string, executable: string, arguments_: string[], decision: PolicyDecision, explanation: string, match?: "prefix"): PolicyRule {
  return { id, operation: "command.execute", executable, arguments: arguments_, decision, explanation, ...(match ? { match } : {}) }
}
