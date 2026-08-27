import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import type { WorkflowDefinition } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import { createSqliteWorkflowStore } from "./sqlite.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")

const definition = (): WorkflowDefinition => {
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(fixturePath, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("fixture invalid")
  return result.definition
}

test("sqlite store inserts and fetches a workflow without sqlite types leaking", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const created = await store.insertWorkflow({ definition: definition() })
  assert.match(created.id, /^wf_/)
  assert.equal(created.name, "implement-review")
  assert.equal(created.definition.agent.model.id, "composer-2.5")
  const fetched = await store.getWorkflow(created.id)
  assert.deepEqual(fetched, created)
  assert.equal(await store.getWorkflow("wf_missing"), null)
})

test("sqlite store persists run agent-handle state and step history", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  const workflow = await store.insertWorkflow({ definition: definition() })
  const run = await store.insertRun({
    workflowId: workflow.id,
    state: "pending"
  })
  assert.match(run.id, /^run_/)
  assert.equal(run.cursorAgentId, null)
  assert.equal(run.temporalWorkflowId, null)
  assert.equal(run.currentStepId, null)

  const updated = await store.updateRun(run.id, {
    cursorAgentId: "bc-11111111-2222-3333-4444-555555555555",
    temporalWorkflowId: "coding-factory-run-1",
    currentStepId: "implementer",
    state: "running"
  })
  assert.equal(updated.cursorAgentId, "bc-11111111-2222-3333-4444-555555555555")
  assert.equal(updated.currentStepId, "implementer")
  assert.equal(updated.state, "running")

  const step = await store.insertRunStep({
    runId: run.id,
    stepId: "implementer",
    cursorAgentId: updated.cursorAgentId,
    prompt: "Implement the change.",
    status: "running",
    startedAt: updated.updatedAt
  })
  assert.match(step.id, /^rs_/)
  const steps = await store.listRunSteps(run.id)
  assert.equal(steps.length, 1)
  assert.equal(steps[0]?.stepId, "implementer")
  assert.equal(steps[0]?.cursorAgentId, "bc-11111111-2222-3333-4444-555555555555")
})

test("sqlite store rejects runs for unknown workflows", async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  t.after(async () => {
    await store.close()
  })
  await assert.rejects(
    () => store.insertRun({ workflowId: "wf_missing" }),
    /workflow not found/
  )
})
