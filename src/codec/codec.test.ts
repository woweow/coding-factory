import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { graphsEqual, jsonToNode, jsonToNodeOrThrow, nodeToJson, WORKFLOW_DEFAULTS } from "./index.ts"
import type { WorkflowDefinition, WorkflowGraph } from "../domain/types.ts"

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(here, "../../dev/fixtures", name), "utf8"))

const decode = (input: unknown): WorkflowGraph => {
  const result = jsonToNode(input)
  assert.equal(result.ok, true, result.ok ? "" : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
  if (!result.ok) throw new Error("jsonToNode failed")
  return result.node
}

const assertRoundtrip = (input: unknown): { node: WorkflowGraph; json: WorkflowDefinition } => {
  const node = decode(input)
  const json = nodeToJson(node)
  assert.deepEqual(nodeToJson(decode(json)), json)
  assert.equal(JSON.stringify(nodeToJson(decode(json))), JSON.stringify(json))
  assert.ok(graphsEqual(decode(json), node))
  return { node, json }
}

test("jsonToNode then nodeToJson is canonical for implement-review fixture", () => {
  const { node, json } = assertRoundtrip(fixture("implement-review.json"))
  assert.equal(json.name, "implement-review")
  assert.equal(json.agent.cloud.autoCreatePR, true)
  assert.equal("workOnCurrentBranch" in json.agent.cloud, false)
  assert.equal("skipReviewerRequest" in json.agent.cloud, false)
  assert.equal("mode" in json.agent, false)
  assert.equal("env" in json.agent.cloud, false)
  assert.equal(node.agent.cloud.workOnCurrentBranch, WORKFLOW_DEFAULTS.workOnCurrentBranch.value)
  assert.equal(node.agent.cloud.skipReviewerRequest, WORKFLOW_DEFAULTS.skipReviewerRequest.value)
  assert.equal(node.agent.mode, WORKFLOW_DEFAULTS.agentMode.value)
  assert.deepEqual(node.agent.cloud.env, WORKFLOW_DEFAULTS.cloudEnv.value)
  assert.equal(node.nodes.length, 3)
})

test("jsonToNode then nodeToJson is canonical for pass-json fixture", () => {
  const { node, json } = assertRoundtrip(fixture("pass-json.json"))
  assert.equal(json.entry, "ask")
  assert.equal("autoCreatePR" in json.agent.cloud, false)
  assert.equal("workOnCurrentBranch" in json.agent.cloud, false)
  assert.equal(json.agent.cloud.skipReviewerRequest, true)
  assert.equal(node.agent.cloud.autoCreatePR, WORKFLOW_DEFAULTS.autoCreatePR.value)
  assert.equal(node.agent.model.id, "composer-2.5")
  assert.equal(node.nodes.length, 2)
})

test("jsonToNode then nodeToJson is canonical for ping-implement-review-pr fixture", () => {
  const { node, json } = assertRoundtrip(fixture("ping-implement-review-pr.json"))
  assert.equal(json.entry, "implementer")
  assert.deepEqual(
    json.steps.map((step) => step.id),
    ["implementer", "reviewer", "open-pr"]
  )
  const openPr = json.steps.find((step) => step.id === "open-pr")
  assert.equal("routes" in (openPr ?? {}), false)
  const openNode = node.nodes.find((item) => item.id === "open-pr")
  assert.deepEqual(openNode?.routes, [])
  assert.equal(node.agent.cloud.autoCreatePR, WORKFLOW_DEFAULTS.autoCreatePR.value)
})

test("sparse document that omits optional fields fires defaults and roundtrips", () => {
  const sparse = fixture("sparse-optional.json")
  const { node, json } = assertRoundtrip(sparse)
  assert.deepEqual(json, sparse)
  assert.equal(json.description, undefined)
  assert.equal("mode" in json.agent, false)
  assert.equal("env" in json.agent.cloud, false)
  assert.equal("workOnCurrentBranch" in json.agent.cloud, false)
  assert.equal("autoCreatePR" in json.agent.cloud, false)
  assert.equal("skipReviewerRequest" in json.agent.cloud, false)
  assert.equal("params" in json.agent.model, false)
  const start = json.steps[0]
  assert.ok(start)
  assert.equal("systemPrompt" in start, false)
  assert.equal("mode" in start, false)
  assert.deepEqual(start.routes, [{ to: "done" }])
  const done = json.steps[1]
  assert.ok(done)
  assert.equal("routes" in done, false)
  assert.equal(node.description, WORKFLOW_DEFAULTS.description.value)
  assert.equal(node.agent.mode, WORKFLOW_DEFAULTS.agentMode.value)
  assert.deepEqual(node.agent.cloud.env, WORKFLOW_DEFAULTS.cloudEnv.value)
  assert.equal(node.agent.cloud.workOnCurrentBranch, WORKFLOW_DEFAULTS.workOnCurrentBranch.value)
  assert.equal(node.agent.cloud.autoCreatePR, WORKFLOW_DEFAULTS.autoCreatePR.value)
  assert.equal(node.agent.cloud.skipReviewerRequest, WORKFLOW_DEFAULTS.skipReviewerRequest.value)
  assert.equal(node.nodes[0]?.systemPrompt, WORKFLOW_DEFAULTS.nodeSystemPrompt.value)
  assert.equal(node.nodes[0]?.mode, WORKFLOW_DEFAULTS.nodeMode.value)
  assert.equal(node.nodes[0]?.routes[0]?.prompt, WORKFLOW_DEFAULTS.routePrompt.value)
  assert.deepEqual(node.nodes[0]?.routes[0]?.match, WORKFLOW_DEFAULTS.routeMatch.value)
  assert.deepEqual(node.nodes[1]?.routes, [])
})

test("nodeToJson then jsonToNode is semantically equal for runtime", () => {
  const node = decode(fixture("implement-review.json"))
  const again = decode(nodeToJson(node))
  assert.ok(graphsEqual(node, again))
  assert.deepEqual(again, node)
})

test("jsonToNode rejects the same forbidden agent fields as before", () => {
  const body = fixture("implement-review.json") as { agent: Record<string, unknown> }
  body.agent = { ...body.agent, apiKey: "secret", local: { cwd: "/tmp" } }
  const result = jsonToNode(body)
  assert.equal(result.ok, false)
  if (result.ok) return
  const paths = result.issues.map((issue) => issue.path)
  assert.ok(paths.includes("agent.apiKey"))
  assert.ok(paths.includes("agent.local"))
})

test("jsonToNodeOrThrow throws on invalid input", () => {
  assert.throws(() => jsonToNodeOrThrow({}), /workflow document is invalid/)
})
