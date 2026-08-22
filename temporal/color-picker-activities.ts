import { DEFAULT_COLOR, type PickRoute } from "./color-picker-shared.ts"

export async function pickRoute(): Promise<PickRoute> {
  if (Math.random() < 0.5) {
    return { tag: "auto", color: DEFAULT_COLOR }
  }
  return { tag: "needColor" }
}

export async function notifyNeedColor(message: string): Promise<void> {
  if (message.length === 0) {
    throw new Error("NeedColor message is required")
  }
  console.log(`  [activity] notifyNeedColor: ${message}`)
}
