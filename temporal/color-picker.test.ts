import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { Worker } from "@temporalio/worker"
import { notifyNeedColor } from "./color-picker-activities.ts"
import { runColorPickerHost, startColorPicker, waitForNeedColor } from "./color-picker-host.ts"
import { DEFAULT_COLOR, HOST_COLOR, NEED_COLOR_MESSAGE, type PickRoute } from "./color-picker-shared.ts"
import { colorPickedSignal } from "./color-picker-workflow.ts"
import { TASK_QUEUE } from "./shared.ts"

const runWithPick = async (route: PickRoute, workflowId: string): Promise<string> => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
      activities: {
        pickRoute: async (): Promise<PickRoute> => route,
        notifyNeedColor
      }
    })
    return await worker.runUntil(async () => {
      const handle = await startColorPicker(testEnv.client, workflowId)
      return runColorPickerHost(handle)
    })
  } finally {
    await testEnv.teardown()
  }
}

test("colorPickerWorkflow auto route logs cyan without a host signal", { timeout: 180_000 }, async () => {
  const color = await runWithPick({ tag: "auto", color: DEFAULT_COLOR }, "color-picker-auto")
  assert.equal(color, DEFAULT_COLOR)
})

test("colorPickerWorkflow waits on NeedColor then resumes with host ColorPicked", { timeout: 180_000 }, async () => {
  const color = await runWithPick({ tag: "needColor" }, "color-picker-wait")
  assert.equal(color, HOST_COLOR)
})

test("colorPickerWorkflow stays paused until ColorPicked", { timeout: 180_000 }, async (t) => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  t.after(async () => {
    await testEnv.teardown()
  })
  let notified = ""
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    taskQueue: TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: {
      pickRoute: async (): Promise<PickRoute> => ({ tag: "needColor" }),
      notifyNeedColor: async (message: string) => {
        notified = message
      }
    }
  })
  await worker.runUntil(async () => {
    const handle = await startColorPicker(testEnv.client, "color-picker-paused")
    const pending = await waitForNeedColor(handle)
    assert.equal(pending, NEED_COLOR_MESSAGE)
    assert.equal(notified, NEED_COLOR_MESSAGE)
    const described = await handle.describe()
    assert.equal(described.status.name, "RUNNING")
    await handle.signal(colorPickedSignal, { color: HOST_COLOR })
    assert.equal(await handle.result(), HOST_COLOR)
  })
})
