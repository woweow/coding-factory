import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { jsonToNodeOrThrow } from "../codec/index.ts"
import type { WorkflowDefinition } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"
import { createFakeCloudDriver } from "./fake-driver.ts"
import { invokeAgent } from "./invoke-agent.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")

const document = (): WorkflowDefinition => {
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(fixturePath, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("fixture invalid")
  return result.definition
}

test("invokeAgent creates then resumes the same cursorAgentId on the run", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const workflow = await store.insertWorkflow({ definition: document() })
  const run = await store.insertRun({
    workflowId: workflow.id,
    currentStepId: "implementer",
    state: "pending"
  })
  const driver = createFakeCloudDriver(['{"ok":true}', '{"decision":"PASS"}', "{}"])
  const graph = jsonToNodeOrThrow(document())
  const implementer = graph.nodes[0]
  const reviewer = graph.nodes[1]
  const complete = graph.nodes[2]
  assert.ok(implementer && reviewer && complete)

  assert.ok(implementer.routes[0] && reviewer.routes[0])

  await invokeAgent(store, driver, {
    runId: run.id,
    nodeId: implementer.id,
    systemPrompt: implementer.systemPrompt,
    edgePrompt: "Begin.",
    routes: implementer.routes,
    mode: implementer.mode
  })
  await invokeAgent(store, driver, {
    runId: run.id,
    nodeId: reviewer.id,
    systemPrompt: reviewer.systemPrompt,
    edgePrompt: implementer.routes[0].prompt,
    routes: reviewer.routes
  })
  await invokeAgent(store, driver, {
    runId: run.id,
    nodeId: complete.id,
    systemPrompt: complete.systemPrompt,
    edgePrompt: reviewer.routes[0].prompt,
    routes: complete.routes
  })

  const stored = await store.getRun(run.id)
  assert.ok(stored?.cursorAgentId)
  assert.match(stored.cursorAgentId, /^bc-fake-/)
  assert.deepEqual(driver.calls, ["create", "resume", "resume"])
  const steps = await store.listRunSteps(run.id)
  assert.equal(steps.length, 3)
  assert.ok(steps.every((step) => step.cursorAgentId === stored.cursorAgentId))
})
