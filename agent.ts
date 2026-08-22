import type { Route } from "./graph.ts"

export type AgentInput = {
  nodeId: string
  systemPrompt: string
  edgePrompt: string
  routes: Route[]
}

export const firstEqualsOutput = (routes: Route[]): Record<string, string> => {
  const first = routes.find((route) => route.match.kind === "equals")
  if (!first || first.match.kind !== "equals") return {}
  return { [first.match.key]: first.match.value }
}

export const invokeAgent = (input: AgentInput): Record<string, string> => {
  console.log(`  entering ${input.nodeId}`)
  console.log(`  system prompt: ${input.systemPrompt} ... edge prompt: ${input.edgePrompt}`)
  return firstEqualsOutput(input.routes)
}
