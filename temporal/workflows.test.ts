import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { Worker } from "@temporalio/worker"
import { TASK_QUEUE } from "./shared.ts"
import { twoNodeWorkflow } from "./workflows.ts"

test("twoNodeWorkflow runs implement then verify", { timeout: 180_000 }, async (t) => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  t.after(async () => {
    await testEnv.teardown()
  })
  const { client, nativeConnection } = testEnv
  const worker = await Worker.create({
    connection: nativeConnection,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: {
      implement: async (ticket: string) => `implemented: ${ticket}`,
      verify: async (work: string) => `verified: ${work}`
    }
  })
  await worker.runUntil(async () => {
    const result = await client.workflow.execute(twoNodeWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "two-node-test",
      args: ["login page"]
    })
    assert.equal(result, "verified: implemented: login page")
  })
})
