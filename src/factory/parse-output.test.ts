import assert from "node:assert/strict"
import { test } from "node:test"
import { parseAgentOutput } from "./parse-output.ts"
import type { WorkflowRoute } from "../domain/types.ts"

const always: WorkflowRoute[] = [{ to: "next", prompt: "go", match: { kind: "always" } }]
const equals: WorkflowRoute[] = [
  { to: "done", prompt: "ok", match: { kind: "equals", key: "decision", value: "PASS" } }
]
const mixed: WorkflowRoute[] = [...always, ...equals]

test("parseAgentOutput reads a JSON object", () => {
  assert.deepEqual(parseAgentOutput('{"decision":"PASS"}', equals), { decision: "PASS" })
})

test("parseAgentOutput reads fenced JSON", () => {
  assert.deepEqual(
    parseAgentOutput("```json\n{\"decision\":\"FIX\"}\n```", equals),
    { decision: "FIX" }
  )
})

test("parseAgentOutput proceeds with {} when parse fails and a route is always", () => {
  assert.deepEqual(parseAgentOutput("not json", always), {})
  assert.deepEqual(parseAgentOutput("not json", mixed), {})
})

test("parseAgentOutput fails when equals is required and parse fails", () => {
  assert.throws(() => parseAgentOutput("PASS", equals), /failed to parse JSON object/)
})

test("parseAgentOutput proceeds with {} for terminal empty routes", () => {
  assert.deepEqual(parseAgentOutput("done", []), {})
})
