import type { Client, WorkflowHandle } from "@temporalio/client"
import { HOST_COLOR } from "./color-picker-shared.ts"
import { colorPickedSignal, colorPickerWorkflow, needColorQuery } from "./color-picker-workflow.ts"
import { TASK_QUEUE } from "./shared.ts"

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const waitForNeedColor = async (
  handle: WorkflowHandle<typeof colorPickerWorkflow>
): Promise<string | null> => {
  for (;;) {
    const { status } = await handle.describe()
    if (status.name !== "RUNNING") return null
    const pending = await handle.query(needColorQuery)
    if (pending !== null) return pending
    await sleep(25)
  }
}

export const runColorPickerHost = async (
  handle: WorkflowHandle<typeof colorPickerWorkflow>
): Promise<string> => {
  const pending = await waitForNeedColor(handle)
  if (pending !== null) {
    console.log(`  [host] emission received: ${pending}`)
    console.log(`  [host] sending ColorPicked(${HOST_COLOR})`)
    await handle.signal(colorPickedSignal, { color: HOST_COLOR })
  }
  return handle.result()
}

export const startColorPicker = (
  client: Client,
  workflowId: string
): Promise<WorkflowHandle<typeof colorPickerWorkflow>> =>
  client.workflow.start(colorPickerWorkflow, {
    args: [],
    taskQueue: TASK_QUEUE,
    workflowId
  })
