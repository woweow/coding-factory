import { fileURLToPath } from "node:url"
import { TestWorkflowEnvironment } from "@temporalio/testing"
import { Worker } from "@temporalio/worker"
import { notifyNeedColor } from "./color-picker-activities.ts"
import { runColorPickerHost, startColorPicker } from "./color-picker-host.ts"
import { DEFAULT_COLOR, TASK_QUEUE, type PickRoute } from "./color-picker-shared.ts"

const scriptedPick = (routes: PickRoute[]) => {
  let i = 0
  return async (): Promise<PickRoute> => {
    const route = routes[i]
    i += 1
    if (!route) throw new Error("pickRoute script exhausted")
    return route
  }
}

const main = async (): Promise<void> => {
  const testEnv = await TestWorkflowEnvironment.createLocal()
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: fileURLToPath(new URL("./color-picker-workflow.ts", import.meta.url)),
      activities: {
        pickRoute: scriptedPick([{ tag: "auto", color: DEFAULT_COLOR }, { tag: "needColor" }]),
        notifyNeedColor
      }
    })
    await worker.runUntil(async () => {
      console.log("--- color picker auto ---")
      const auto = await startColorPicker(testEnv.client, "color-picker-auto")
      console.log(`result: ${await runColorPickerHost(auto)}\n`)
      console.log("--- color picker wait ---")
      const waiting = await startColorPicker(testEnv.client, "color-picker-wait")
      console.log(`result: ${await runColorPickerHost(waiting)}`)
      console.log("--- done ---")
    })
  } finally {
    await testEnv.teardown()
  }
}

const isMain = process.argv[1]?.endsWith("color-picker-run.ts") || process.argv[1]?.endsWith("color-picker-run.js")
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
