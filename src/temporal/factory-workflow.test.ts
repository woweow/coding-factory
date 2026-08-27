import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { Worker } from "@temporalio/worker"
import type { WorkflowDefinition } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import { createFakeCloudDriver } from "../factory/fake-driver.ts"
import { createSqliteWorkflowStore } from "../storage/sqlite.ts"
import { createFactoryActivities } from "./activities.ts"
import { FACTORY_TASK_QUEUE } from "./shared.ts"
import { factoryWorkflow } from "./workflows.ts"

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../dev/fixtures/implement-review.json")

const definition = (): WorkflowDefinition => {
  const result = validateWorkflowDefinition(JSON.parse(readFileSync(fixturePath, "utf8")))
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("fixture invalid")
  return result.definition
}

test("factoryWorkflow threads cursorAgentId across steps with a fake SDK", { timeout: 180_000 }, async (t) => {
  const store = createSqliteWorkflowStore(":memory:")
  const driver = createFakeCloudDriver()
  t.after(async () => {
    await store.close()
  })
  const testEnv = await TestWorkflowEnvironment.createLocal()
  t.after(async () => {
    await testEnv.teardown()
  })
  const workflow = await store.insertWorkflow({ definition: definition() })
  const run = await store.insertRun({
    workflowId: workflow.id,
    currentStepId: "implementer",
    state: "running",
    temporalWorkflowId: `factory-${randomUUID()}`
  })
  const { client, nativeConnection } = testEnv
  const worker = await Worker.create({
    connection: nativeConnection,
    taskQueue: FACTORY_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: createFactoryActivities(store, driver)
  })
  await worker.runUntil(async () => {
    const path = await client.workflow.execute(factoryWorkflow, {
      taskQueue: FACTORY_TASK_QUEUE,
      workflowId: `factory-${run.id}`,
      args: [{ runId: run.id, definition: definition(), prompt: "Begin." }]
    })
    assert.deepEqual(path, ["implementer", "reviewer", "complete"])
  })
  const stored = await store.getRun(run.id)
  assert.equal(stored?.state, "completed")
  assert.ok(stored?.cursorAgentId)
  assert.match(stored.cursorAgentId, /^bc-fake-/)
  assert.deepEqual(driver.calls, ["create", "resume", "resume"])
  const steps = await store.listRunSteps(run.id)
  assert.equal(steps.length, 3)
  assert.ok(steps.every((step) => step.cursorAgentId === stored.cursorAgentId))
})
