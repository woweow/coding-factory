import assert from "node:assert/strict"
import { test } from "node:test"
import type { WorkflowStep } from "../domain/types.ts"
import {
  agentInputForStep,
  DEFAULT_ROUTE_MATCH,
  DEFAULT_ROUTE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  executeRoutes,
  executeSystemPrompt
} from "./execute.ts"

test("executeSystemPrompt defaults omitted systemPrompt to empty string", () => {
  assert.equal(executeSystemPrompt({ id: "only" }), DEFAULT_SYSTEM_PROMPT)
  assert.equal(executeSystemPrompt({ id: "only", systemPrompt: "" }), "")
  assert.equal(executeSystemPrompt({ id: "only", systemPrompt: "hi" }), "hi")
})

test("executeRoutes defaults omitted routes, prompt, and match", () => {
  assert.deepEqual(executeRoutes({ id: "only" }), [])
  assert.deepEqual(executeRoutes({ id: "only", routes: [{ to: "next" }] }), [
    { to: "next", prompt: DEFAULT_ROUTE_PROMPT, match: DEFAULT_ROUTE_MATCH }
  ])
})

test("agentInputForStep does not fill omitted step mode", () => {
  const step: WorkflowStep = { id: "only", routes: [{ to: "done" }] }
  const input = agentInputForStep("run_1", step, "Begin.")
  assert.equal("mode" in input, false)
  assert.equal(input.mode, undefined)
  assert.equal(input.systemPrompt, "")
  assert.deepEqual(input.routes, [{ to: "done", prompt: "", match: { kind: "always" } }])
})

test("agentInputForStep keeps an explicit step mode", () => {
  const input = agentInputForStep("run_1", { id: "only", mode: "plan" }, "Begin.")
  assert.equal(input.mode, "plan")
})
