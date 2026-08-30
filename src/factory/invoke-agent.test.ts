import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import type { WorkflowDefinition } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"
import { agentInputForStep } from "./execute.ts"
import { createFakeCloudDriver } from "./fake-driver.ts"
import { invokeAgent } from "./invoke-agent.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")

const definition = (): WorkflowDefinition => {
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(fixturePath, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("fixture invalid")
  return result.definition
}

const planSparseDefinition = (): WorkflowDefinition => {
  const result = validateWorkflowDefinition({
    name: "plan-sparse",
    entry: "a",
    agent: {
      mode: "plan",
      model: { id: "composer-2.5", params: [{ id: "fast", value: "false" }] },
      cloud: { repos: [{ url: "https://github.com/woweow/coding-factory", startingRef: "main" }] }
    },
    steps: [{ id: "a", routes: [{ to: "b" }] }, { id: "b" }]
  })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("sparse definition invalid")
  return result.definition
}

test("invokeAgent creates then resumes the same cursorAgentId on the run", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const workflow = await store.insertWorkflow({ definition: definition() })
  const run = await store.insertRun({
    workflowId: workflow.id,
    currentStepId: "implementer",
    state: "pending"
  })
  const driver = createFakeCloudDriver(['{"ok":true}', '{"decision":"PASS"}', "{}"])
  const def = definition()
  const implementer = def.steps[0]
  const reviewer = def.steps[1]
  const complete = def.steps[2]
  assert.ok(implementer && reviewer && complete)

  await invokeAgent(store, driver, agentInputForStep(run.id, implementer, "Begin."))
  await invokeAgent(store, driver, agentInputForStep(run.id, reviewer, implementer.routes?.[0]?.prompt ?? ""))
  await invokeAgent(store, driver, agentInputForStep(run.id, complete, reviewer.routes?.[0]?.prompt ?? ""))

  const stored = await store.getRun(run.id)
  assert.ok(stored?.cursorAgentId)
  assert.match(stored.cursorAgentId, /^bc-fake-/)
  assert.deepEqual(driver.calls, ["create", "resume", "resume"])
  const steps = await store.listRunSteps(run.id)
  assert.equal(steps.length, 3)
  assert.ok(steps.every((step) => step.cursorAgentId === stored.cursorAgentId))
})

test("agent.mode=plan with no per-step mode does not send mode agent", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const def = planSparseDefinition()
  const workflow = await store.insertWorkflow({ definition: def })
  const run = await store.insertRun({
    workflowId: workflow.id,
    currentStepId: "a",
    state: "pending"
  })
  const driver = createFakeCloudDriver()
  const first = def.steps[0]
  const second = def.steps[1]
  assert.ok(first && second)
  assert.equal("mode" in first, false)
  assert.equal("mode" in second, false)

  await invokeAgent(store, driver, agentInputForStep(run.id, first, "Begin."))
  await invokeAgent(store, driver, agentInputForStep(run.id, second, ""))

  assert.equal(driver.createdOptions?.mode, "plan")
  assert.equal(driver.sends.length, 2)
  for (const send of driver.sends) {
    assert.equal(send.mode, undefined)
    assert.notEqual(send.mode, "agent")
  }
  const stored = await store.getRun(run.id)
  assert.equal(stored?.state, "running")
  assert.deepEqual(driver.calls, ["create", "resume"])
})
