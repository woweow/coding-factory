import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { validateWorkflowDefinition } from "./validate.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")

const loadFixture = (): unknown => JSON.parse(readFileSync(fixturePath, "utf8"))

const validBody = (): Record<string, unknown> => {
  const parsed: unknown = loadFixture()
  assert.ok(parsed !== null && typeof parsed === "object")
  return structuredClone(parsed) as Record<string, unknown>
}

test("accepts the implement-review fixture", () => {
  const result = validateWorkflowDefinition(loadFixture())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.definition.agent.model.id, "composer-2.5")
  assert.deepEqual(result.definition.agent.model.params, [{ id: "fast", value: "false" }])
  assert.equal(result.definition.agent.cloud.repos[0]?.url, "https://github.com/woweow/coding-factory")
  assert.equal(result.definition.steps.length, 3)
})

test("accepts the pass-json live-check fixture", () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/pass-json.json")
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(path, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.definition.agent.model.id, "composer-2.5")
  assert.deepEqual(result.definition.agent.model.params, [{ id: "fast", value: "false" }])
  assert.equal(result.definition.steps.length, 2)
  assert.equal(result.definition.entry, "ask")
  assert.equal(result.definition.agent.cloud.autoCreatePR, false)
})

test("accepts the ping-implement-review-pr fixture", () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/ping-implement-review-pr.json")
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(path, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.definition.entry, "implementer")
  assert.equal(result.definition.agent.model.id, "composer-2.5")
  assert.deepEqual(result.definition.agent.model.params, [{ id: "fast", value: "false" }])
  assert.equal(result.definition.agent.cloud.repos[0]?.startingRef, "main")
  assert.equal(result.definition.agent.cloud.autoCreatePR, false)
  assert.equal(result.definition.agent.cloud.workOnCurrentBranch, false)
  assert.equal(result.definition.steps.length, 3)
  assert.deepEqual(
    result.definition.steps.map((step) => step.id),
    ["implementer", "reviewer", "open-pr"]
  )
  const openPr = result.definition.steps.find((step) => step.id === "open-pr")
  assert.deepEqual(openPr?.routes, [])
})

test("rejects agent.local", () => {
  const body = validBody()
  const agent = body.agent as Record<string, unknown>
  agent.local = { cwd: "/tmp" }
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path === "agent.local"))
})

test("rejects apiKey anywhere in the body", () => {
  const body = validBody()
  const agent = body.agent as Record<string, unknown>
  agent.apiKey = "secret"
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path === "agent.apiKey"))
})

test("rejects agent.mcpServers and agent.agents", () => {
  const withMcp = validBody()
  const mcpAgent = withMcp.agent as Record<string, unknown>
  mcpAgent.mcpServers = { linear: { type: "http", url: "https://example.com" } }
  const mcpResult = validateWorkflowDefinition(withMcp)
  assert.equal(mcpResult.ok, false)
  if (!mcpResult.ok) {
    assert.ok(mcpResult.issues.some((issue) => issue.path === "agent.mcpServers"))
  }
  const withSub = validBody()
  const subAgent = withSub.agent as Record<string, unknown>
  subAgent.agents = { helper: { description: "x", prompt: "y" } }
  const subResult = validateWorkflowDefinition(withSub)
  assert.equal(subResult.ok, false)
  if (!subResult.ok) {
    assert.ok(subResult.issues.some((issue) => issue.path === "agent.agents"))
  }
})

test("rejects missing cloud.repos so the SDK cannot default to local", () => {
  const body = validBody()
  const agent = body.agent as Record<string, unknown>
  const cloud = { ...(agent.cloud as Record<string, unknown>) }
  delete cloud.repos
  agent.cloud = cloud
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path === "agent.cloud.repos"))
})

test("rejects empty repos", () => {
  const body = validBody()
  const agent = body.agent as Record<string, unknown>
  const cloud = { ...(agent.cloud as Record<string, unknown>), repos: [] }
  agent.cloud = cloud
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path === "agent.cloud.repos"))
})

test("rejects CURSOR_ env var names", () => {
  const body = validBody()
  const agent = body.agent as Record<string, unknown>
  const cloud = {
    ...(agent.cloud as Record<string, unknown>),
    envVars: { CURSOR_API_KEY: "nope" }
  }
  agent.cloud = cloud
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path.includes("CURSOR_API_KEY")))
})

test("rejects unknown route targets and missing entry", () => {
  const body = validBody()
  body.entry = "missing"
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.path === "entry"))
})

test("rejects duplicate step ids", () => {
  const body = validBody()
  body.steps = [
    { id: "same", routes: [] },
    { id: "same", routes: [] }
  ]
  body.entry = "same"
  const result = validateWorkflowDefinition(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.issues.some((issue) => issue.message.includes("duplicate step id")))
})
