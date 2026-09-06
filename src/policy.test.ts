import assert from "node:assert/strict"
import test from "node:test"
import { evaluatePolicy, type OperationRequest, type Policy } from "./policy.ts"

const request = (rawCommand: string, workingDirectory = "/workspace"): OperationRequest => ({
  operation: "command.execute",
  rawCommand,
  workingDirectory,
})

const policy: Policy = {
  rules: [
    {
      id: "read-git-status",
      operation: "command.execute",
      executable: "git",
      arguments: ["status"],
      decision: "allow",
      explanation: "Git status only reads repository state.",
    },
    {
      id: "read-print",
      operation: "command.execute",
      executable: "printf",
      match: "prefix",
      decision: "allow",
      explanation: "Printf is allowed for this prototype.",
    },
    {
      id: "push-needs-approval",
      operation: "command.execute",
      executable: "git",
      arguments: ["push"],
      decision: "ask",
      explanation: "Push changes external repository state.",
    },
    {
      id: "destructive-reset",
      operation: "command.execute",
      executable: "git",
      arguments: ["reset", "--hard"],
      match: "prefix",
      decision: "deny",
      explanation: "Hard reset can discard local work.",
    },
  ],
}

test("allows a simple command that matches an allow rule", () => {
  const result = evaluatePolicy(request("git status"), policy)

  assert.equal(result.status, "available")
  assert.equal(result.decision, "allow")
  assert.deepEqual(result.matchedRuleIds, ["read-git-status"])
})

test("asks for an unknown command", () => {
  const result = evaluatePolicy(request("echo hello"), policy)

  assert.equal(result.status, "available")
  assert.equal(result.decision, "ask")
  assert.match(result.explanation, /No Policy rule/)
})

test("denies a destructive command without an approval path", () => {
  const result = evaluatePolicy(request("git reset --hard HEAD"), policy)

  assert.equal(result.status, "available")
  assert.equal(result.decision, "deny")
  assert.deepEqual(result.matchedRuleIds, ["destructive-reset"])
})

test("uses deny over ask and allow when several rules match", () => {
  const result = evaluatePolicy(request("git reset --hard HEAD"), {
    rules: [
      ...policy.rules,
      {
        id: "all-git-ask",
        operation: "command.execute",
        executable: "git",
        match: "prefix",
        decision: "ask",
        explanation: "All Git commands need review.",
      },
    ],
  })

  assert.equal(result.decision, "deny")
  assert.deepEqual(result.matchedRuleIds, ["destructive-reset", "all-git-ask"])
})

test("allows a composed command when every part is allowed", () => {
  const result = evaluatePolicy(request("printf 'left\\nright\\n' | wc -l"), {
    rules: [
      ...policy.rules,
      {
        id: "read-wc",
        operation: "command.execute",
        executable: "wc",
        arguments: ["-l"],
        decision: "allow",
        explanation: "Word count reads its input.",
      },
    ],
  })

  assert.equal(result.decision, "allow")
  assert.equal(result.parts.length, 2)
})

test("asks when one composed command part needs approval", () => {
  const result = evaluatePolicy(request("git status && git push"), policy)

  assert.equal(result.decision, "ask")
  assert.deepEqual(result.matchedRuleIds, ["read-git-status", "push-needs-approval"])
})

test("denies when one composed command part is destructive", () => {
  const result = evaluatePolicy(request("printf safe; git reset --hard HEAD"), policy)

  assert.equal(result.decision, "deny")
  assert.deepEqual(result.matchedRuleIds, ["read-print", "destructive-reset"])
})

test("asks when shell structure is uncertain", () => {
  const result = evaluatePolicy(request("printf \"$(git status)\""), policy)

  assert.equal(result.decision, "ask")
  assert.equal(result.parts[0]?.parsedCommandMetadata?.shellMode, "uncertain")
})

test("does not trust metadata that conflicts with the Raw command", () => {
  const result = evaluatePolicy({
    ...request("git reset --hard HEAD"),
    parsedCommandMetadata: {
      executable: "git",
      arguments: ["status"],
      shellMode: "simple",
    },
  }, policy)

  assert.equal(result.decision, "ask")
  assert.match(result.explanation, /conflicts with the Raw command/)
})

test("can restrict an allow rule to one working directory", () => {
  const restrictedPolicy: Policy = {
    rules: [{
      ...policy.rules[0],
      workingDirectory: "/workspace/project",
    }],
  }

  assert.equal(evaluatePolicy(request("git status", "/workspace/project"), restrictedPolicy).decision, "allow")
  assert.equal(evaluatePolicy(request("git status", "/workspace/other"), restrictedPolicy).decision, "ask")
})

test("returns unavailable for invalid policy configuration", () => {
  const result = evaluatePolicy(request("git status"), {
    rules: [{ ...policy.rules[0], id: "" }],
  })

  assert.equal(result.status, "unavailable")
  assert.match(result.explanation, /configuration is unavailable/)
})

test("keeps approval scope separate from policy decisions", () => {
  const result = evaluatePolicy(request("git push"), policy)

  assert.equal(result.decision, "ask")
  assert.equal("scope" in result, false)
})

test("propagates the operation correlation identity", () => {
  const result = evaluatePolicy({
    ...request("git status"),
    correlationId: "operation-123",
  }, policy)

  assert.equal(result.correlationId, "operation-123")
})
