import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow"
import { NEED_COLOR_MESSAGE, type ColorPicked } from "./color-picker-shared.ts"
import type * as activities from "./color-picker-activities.ts"

const { pickRoute, notifyNeedColor } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute"
})

export const colorPickedSignal = defineSignal<[ColorPicked]>("ColorPicked")
export const needColorQuery = defineQuery<string | null>("NeedColor")

export async function colorPickerWorkflow(): Promise<string> {
  let picked: string | undefined
  let needColor: string | null = null

  setHandler(colorPickedSignal, (event) => {
    picked = event.color
    needColor = null
  })
  setHandler(needColorQuery, () => needColor)

  console.log("  [state] entering colorPicker")
  const output = await pickRoute()
  if (output.tag === "auto") {
    console.log(`  [colorPicker] auto route → ${output.color}`)
    console.log(`  [colorLogger] logging color: ${output.color}`)
    return output.color
  }

  console.log("  [colorPicker] needColor route → resting, emitting")
  await notifyNeedColor(NEED_COLOR_MESSAGE)
  needColor = NEED_COLOR_MESSAGE
  await condition(() => picked !== undefined)
  console.log(`  [colorPicker] ColorPicked event → ${picked}`)
  console.log(`  [colorLogger] logging color: ${picked}`)
  if (picked === undefined) throw new Error("ColorPicked did not provide a color")
  return picked
}
