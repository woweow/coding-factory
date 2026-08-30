import type { CloudEnv, ConversationMode, ModelParameterValue, OutputMatch, WorkflowRouteJson } from "../domain/types.ts"

/**
 * Single source of truth for JSON ↔ Node defaults.
 * jsonToNode applies these. nodeToJson omits a field when its value equals the table.
 * Callers must not sprinkle fallbacks (`??`, `||`) for these fields.
 */
export type DefaultSpec<T> = {
  value: T
  /** fill: runtime always has this value. omit-empty: missing/empty stays absent on the node. */
  apply: "fill" | "omit-empty"
}

export const WORKFLOW_DEFAULTS = {
  description: { value: "", apply: "fill" },
  agentMode: { value: "agent" as ConversationMode, apply: "fill" },
  cloudEnv: { value: { type: "cloud" } as CloudEnv, apply: "fill" },
  workOnCurrentBranch: { value: false, apply: "fill" },
  autoCreatePR: { value: false, apply: "fill" },
  skipReviewerRequest: { value: false, apply: "fill" },
  modelParams: { value: [] as ModelParameterValue[], apply: "omit-empty" },
  envVars: { value: {} as Record<string, string>, apply: "omit-empty" },
  metadata: { value: {} as Record<string, string>, apply: "omit-empty" },
  nodeSystemPrompt: { value: "", apply: "fill" },
  nodeMode: { value: "agent" as ConversationMode, apply: "fill" },
  nodeRoutes: { value: [] as WorkflowRouteJson[], apply: "fill" },
  routePrompt: { value: "", apply: "fill" },
  routeMatch: { value: { kind: "always" } as OutputMatch, apply: "fill" }
} as const

export const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right) return false
  if (left === null || right === null) return left === right
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((item, index) => valuesEqual(item, right[index]))
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length) return false
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    return leftKeys.every(
      (key, index) => key === rightKeys[index] && valuesEqual(leftRecord[key], rightRecord[key])
    )
  }
  return false
}

export const fillDefault = <T>(raw: T | undefined, spec: { value: T }): T =>
  raw === undefined ? spec.value : raw

export const omitIfDefault = <T>(raw: T | undefined, spec: { value: T }): T | undefined => {
  if (raw === undefined || valuesEqual(raw, spec.value)) return undefined
  return raw
}
