import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { Worker } from "@temporalio/worker"
import { branchGraph } from "../graph.ts"
import type { AgentInput } from "./activities.ts"
import { TASK_QUEUE } from "./shared.ts"
import { graphWorkflow } from "./workflows.ts"

const scripted = (decisions: string[]) => {
  let i = 0
  return async (_input: AgentInput) => {
    const decision = decisions[i++]
    if (!decision) throw new Error("script exhausted")
    return { decision }
  }
}

test("graphWorkflow walks implementer -> reviewer -> complete", { timeout: 180_000 }, async (t) => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  t.after(async () => {
    await testEnv.teardown()
  })
  const { client, nativeConnection } = testEnv
  const worker = await Worker.create({
    connection: nativeConnection,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: { fakeAgent: scripted(["CONTINUE", "PASS"]) }
  })
  await worker.runUntil(async () => {
    const path = await client.workflow.execute(graphWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "graph-pass",
      args: [branchGraph, "Implement this feature request."]
    })
    assert.deepEqual(path, ["implementer", "reviewer", "complete"])
  })
})

test("graphWorkflow loops FIX then PASS", { timeout: 180_000 }, async (t) => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  t.after(async () => {
    await testEnv.teardown()
  })
  const { client, nativeConnection } = testEnv
  const worker = await Worker.create({
    connection: nativeConnection,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: { fakeAgent: scripted(["CONTINUE", "FIX", "CONTINUE", "PASS"]) }
  })
  await worker.runUntil(async () => {
    const path = await client.workflow.execute(graphWorkflow, {
      taskQueue: TASK_QUEUE,
      workflowId: "graph-fix",
      args: [branchGraph, "Implement this feature request."]
    })
    assert.deepEqual(path, ["implementer", "reviewer", "implementer", "reviewer", "complete"])
  })
})
