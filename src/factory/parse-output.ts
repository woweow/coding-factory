import type { WorkflowRoute } from "../domain/types.ts"

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      out[key] = child
      continue
    }
    if (typeof child === "number" || typeof child === "boolean") {
      out[key] = String(child)
      continue
    }
    return undefined
  }
  return out
}

const tryParseObject = (text: string): Record<string, string> | undefined => {
  const trimmed = text.trim()
  if (trimmed === "") return undefined
  const candidates: string[] = [trimmed]
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.unshift(fence[1].trim())
  const brace = trimmed.match(/\{[\s\S]*\}/)
  if (brace?.[0]) candidates.push(brace[0])
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      const record = asStringRecord(parsed)
      if (record) return record
    } catch {
      continue
    }
  }
  return undefined
}

export const parseAgentOutput = (text: string, routes: WorkflowRoute[]): Record<string, string> => {
  const parsed = tryParseObject(text)
  if (parsed) return parsed
  const resolved = routes.map((route) => route.match ?? { kind: "always" as const })
  const hasAlways = resolved.some((match) => match.kind === "always")
  const hasEquals = resolved.some((match) => match.kind === "equals")
  if (hasAlways || !hasEquals) return {}
  throw new Error("failed to parse JSON object from assistant text")
}

export const buildStepPrompt = (systemPrompt: string, edgePrompt: string): string => {
  const system = systemPrompt.trim()
  const edge = edgePrompt.trim()
  if (system === "") return edge
  if (edge === "") return system
  return `${system}\n\n${edge}\n\nWhen you finish, reply with a JSON object of string values so the factory can route (example: {"decision":"PASS"}).`
}
