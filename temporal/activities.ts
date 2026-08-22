import type { Route } from "../graph.ts"

export type AgentInput = {
  nodeId: string
  systemPrompt: string
  edgePrompt: string
  routes: Route[]
}

export async function fakeAgent(input: AgentInput): Promise<Record<string, string>> {
  console.log(`fakeAgent ${input.nodeId}`)
  console.log(`  system prompt: ${input.systemPrompt}`)
  console.log(`  edge prompt: ${input.edgePrompt}`)
  const first = input.routes.find((route) => route.match.kind === "equals")
  if (!first || first.match.kind !== "equals") {
    console.log("  fake output: {}")
    return {}
  }
  const output = { [first.match.key]: first.match.value }
  console.log(`  fake output: ${JSON.stringify(output)}`)
  return output
}
