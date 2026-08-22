export const DEFAULT_COLOR = "cyan"
export const HOST_COLOR = "red"
export const NEED_COLOR_MESSAGE = "Hey, I need a color"
export const TASK_QUEUE = "color-picker-queue"

export type PickRoute =
  | { tag: "auto"; color: string }
  | { tag: "needColor" }

export type ColorPicked = { color: string }
