import { ApplicationFailure, proxyActivities } from "@temporalio/workflow"
import { nodeById, type RoutedGraph } from "../graph.ts"
import type * as activities from "./activities.ts"

const { invokeAgent } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute"
})

export async function graphWorkflow(graph: RoutedGraph, edgePrompt: string): Promise<string[]> {
  const path: string[] = []
  let current = nodeById(graph, graph.entry)
  let incomingEdge = edgePrompt
  for (let hop = 0; hop < 32; hop++) {
    path.push(current.id)
    const output = await invokeAgent({
      nodeId: current.id,
      systemPrompt: current.systemPrompt ?? "",
      edgePrompt: incomingEdge,
      routes: current.routes
    })
    if (current.routes.length === 0) return path
    const route = current.routes.find((candidate) => {
      if (candidate.match.kind === "always") return true
      return output[candidate.match.key] === candidate.match.value
    })
    if (!route) {
      throw ApplicationFailure.nonRetryable(
        `no route from ${current.id} for ${JSON.stringify(output)}`
      )
    }
    current = nodeById(graph, route.to)
    incomingEdge = route.prompt
  }
  throw ApplicationFailure.nonRetryable("graph hop cap")
}
