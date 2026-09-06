export type OperationName = "command.execute"
export type PolicyDecision = "allow" | "ask" | "deny"
export type MatchMode = "exact" | "prefix"
export type ShellMode = "simple" | "composed" | "uncertain"
export type ApprovalStatus = "approved" | "denied" | "cancelled" | "unavailable"
export type ApprovalScope = "once" | "session"

export type ParsedCommandMetadata = {
  executable?: string
  arguments?: string[]
  shellMode: ShellMode
}

export type OperationRequest = {
  operation: OperationName
  rawCommand: string
  workingDirectory: string
  parsedCommandMetadata?: ParsedCommandMetadata
  correlationId?: string
}

export type PolicyRule = {
  id: string
  operation: OperationName
  executable: string
  arguments?: string[]
  match?: MatchMode
  workingDirectory?: string
  decision: PolicyDecision
  explanation: string
}

export type Policy = {
  rules: readonly PolicyRule[]
}

export type ApprovalRequest = {
  operation: OperationRequest
  explanation: string
  ruleIds: string[]
  defaultScope: "once"
  supportedScopes: ApprovalScope[]
}

export type ApprovalOutcome = {
  status: ApprovalStatus
  scope?: ApprovalScope
  note?: string
}

export type PolicyPartEvaluation = {
  rawCommand: string
  decision: PolicyDecision
  explanation: string
  matchedRuleIds: string[]
  parsedCommandMetadata?: ParsedCommandMetadata
}

export type PolicyEvaluation =
  | {
      status: "available"
      decision: PolicyDecision
      explanation: string
      matchedRuleIds: string[]
      parts: PolicyPartEvaluation[]
    }
  | {
      status: "unavailable"
      explanation: string
      matchedRuleIds: []
      parts: []
    }

const decisionRank: Record<PolicyDecision, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
}

export function evaluatePolicy(request: OperationRequest, policy: Policy): PolicyEvaluation {
  const configurationError = validatePolicy(policy)
  if (configurationError) {
    return unavailable(`Policy configuration is unavailable: ${configurationError}`)
  }

  if (request.operation !== "command.execute" || !request.rawCommand.trim() || !request.workingDirectory) {
    return unavailable("Operation request is unavailable: command.execute, rawCommand, and workingDirectory are required.")
  }

  const parsed = parseCommand(request.rawCommand)
  if (parsed.mode === "uncertain") {
    return {
      status: "available",
      decision: "ask",
      explanation: "The shell structure cannot be classified confidently.",
      matchedRuleIds: [],
      parts: [partResult(request.rawCommand, "ask", "The shell structure cannot be classified confidently.", [], parsed.metadata)],
    }
  }

  if (parsed.mode === "composed") {
    const parts = parsed.parts.map((part) => evaluatePart(part, request.workingDirectory, policy.rules))
    return combineParts(parts)
  }

  const parsedMetadata = parseSimpleCommand(request.rawCommand)
  if (request.parsedCommandMetadata && !sameMetadata(parsedMetadata, request.parsedCommandMetadata)) {
    const part = partResult(
      request.rawCommand,
      "ask",
      "Parsed command metadata conflicts with the Raw command.",
      [],
      parsedMetadata,
    )
    return combineParts([part])
  }

  const part = evaluatePart(request.rawCommand, request.workingDirectory, policy.rules, parsedMetadata)
  return combineParts([part])
}

function evaluatePart(
  rawCommand: string,
  workingDirectory: string,
  rules: readonly PolicyRule[],
  suppliedMetadata?: ParsedCommandMetadata,
): PolicyPartEvaluation {
  const parsed = suppliedMetadata ?? parseSimpleCommand(rawCommand)
  if (parsed.shellMode === "uncertain" || !parsed.executable || !parsed.arguments) {
    return partResult(rawCommand, "ask", "The command cannot be classified confidently.", [], parsed)
  }

  const matches = rules.filter((rule) => matchesRule(rule, parsed, workingDirectory))
  if (matches.length === 0) {
    return partResult(rawCommand, "ask", "No Policy rule matches this command.", [], parsed)
  }

  const decision = strongestDecision(matches.map((rule) => rule.decision))
  const selected = matches.filter((rule) => rule.decision === decision)
  return partResult(rawCommand, decision, selected.map((rule) => rule.explanation).join(" "), matches.map((rule) => rule.id), parsed)
}

function matchesRule(rule: PolicyRule, parsed: ParsedCommandMetadata, workingDirectory: string): boolean {
  if (rule.operation !== "command.execute" || parsed.executable !== rule.executable) return false
  if (rule.workingDirectory && rule.workingDirectory !== workingDirectory) return false

  const expected = rule.arguments ?? []
  const actual = parsed.arguments ?? []
  if ((rule.match ?? "exact") === "prefix") {
    return expected.every((argument, index) => actual[index] === argument)
  }
  return expected.length === actual.length && expected.every((argument, index) => actual[index] === argument)
}

function combineParts(parts: PolicyPartEvaluation[]): PolicyEvaluation {
  const decision = strongestDecision(parts.map((part) => part.decision))
  return {
    status: "available",
    decision,
    explanation: parts.map((part) => part.explanation).join(" "),
    matchedRuleIds: parts.flatMap((part) => part.matchedRuleIds),
    parts,
  }
}

function strongestDecision(decisions: PolicyDecision[]): PolicyDecision {
  return decisions.reduce<PolicyDecision>(
    (strongest, decision) => decisionRank[decision] > decisionRank[strongest] ? decision : strongest,
    "allow",
  )
}

function sameMetadata(left: ParsedCommandMetadata, right: ParsedCommandMetadata): boolean {
  return left.shellMode === right.shellMode &&
    left.executable === right.executable &&
    JSON.stringify(left.arguments ?? []) === JSON.stringify(right.arguments ?? [])
}

function partResult(
  rawCommand: string,
  decision: PolicyDecision,
  explanation: string,
  matchedRuleIds: string[],
  parsedCommandMetadata?: ParsedCommandMetadata,
): PolicyPartEvaluation {
  return { rawCommand, decision, explanation, matchedRuleIds, parsedCommandMetadata }
}

function unavailable(explanation: string): PolicyEvaluation {
  return { status: "unavailable", explanation, matchedRuleIds: [], parts: [] }
}

function validatePolicy(policy: Policy): string | undefined {
  if (!policy || !Array.isArray(policy.rules)) return "rules must be an array."
  const ids = new Set<string>()
  for (const rule of policy.rules) {
    if (!rule.id || ids.has(rule.id)) return "rule IDs must be non-empty and unique."
    if (rule.operation !== "command.execute") return `rule ${rule.id} has an unsupported operation.`
    if (!rule.executable || !rule.explanation) return `rule ${rule.id} requires an executable and explanation.`
    if (rule.match && !["exact", "prefix"].includes(rule.match)) return `rule ${rule.id} has an unsupported match mode.`
    ids.add(rule.id)
  }
}

function parseCommand(rawCommand: string):
  | { mode: "simple"; parts: never[]; metadata: ParsedCommandMetadata }
  | { mode: "composed"; parts: string[]; metadata?: undefined }
  | { mode: "uncertain"; parts: never[]; metadata: ParsedCommandMetadata } {
  const parts: string[] = []
  let start = 0
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = 0; index < rawCommand.length; index += 1) {
    const character = rawCommand[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character === "`" || rawCommand.startsWith("$(", index) || character === ">" || character === "<") {
      return { mode: "uncertain", parts: [], metadata: { shellMode: "uncertain" } }
    }
    if (character === ";" || character === "|" || character === "&") {
      if (character === "&" && rawCommand[index + 1] !== "&") {
        return { mode: "uncertain", parts: [], metadata: { shellMode: "uncertain" } }
      }
      const operatorIndex = index
      if (rawCommand[index + 1] === character) index += 1
      parts.push(rawCommand.slice(start, operatorIndex).trim())
      start = index + 1
    }
  }

  if (quote || escaped) return { mode: "uncertain", parts: [], metadata: { shellMode: "uncertain" } }
  parts.push(rawCommand.slice(start).trim())
  if (parts.some((part) => !part)) return { mode: "uncertain", parts: [], metadata: { shellMode: "uncertain" } }
  if (parts.length > 1) return { mode: "composed", parts }
  return { mode: "simple", parts: [], metadata: parseSimpleCommand(rawCommand) }
}

function parseSimpleCommand(rawCommand: string): ParsedCommandMetadata {
  const words: string[] = []
  let word = ""
  let quote: "'" | '"' | undefined
  let escaped = false

  for (const character of rawCommand.trim()) {
    if (escaped) {
      word += character
      escaped = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = undefined
      else word += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
    } else if (/\s/.test(character)) {
      if (word) words.push(word)
      word = ""
    } else {
      word += character
    }
  }
  if (word) words.push(word)
  if (quote || escaped || words.length === 0 || words.some((word) => word.includes("$"))) {
    return { shellMode: "uncertain" }
  }
  return { executable: words[0], arguments: words.slice(1), shellMode: "simple" }
}
