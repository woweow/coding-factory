import { ApplicationFailure, proxyActivities } from "@temporalio/workflow"
import { isTerminal, matchRoute, nodeById, routeChoices, type RoutedGraph } from "../graph.ts"
import type * as activities from "./activities.ts"

const { runNode } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute"
})

export async function graphWorkflow(graph: RoutedGraph, edgePrompt: string): Promise<string[]> {
  const path: string[] = []
  let current = nodeById(graph, graph.entry)
  let prompt = edgePrompt
  for (let i = 0; i < 32; i++) {
    path.push(current.id)
    if (isTerminal(current)) return path
    const output = await runNode({
      id: current.id,
      systemPrompt: current.systemPrompt ?? "",
      edgePrompt: prompt,
      choices: routeChoices(current.routes)
    })
    const route = matchRoute(current.routes, output)
    if (!route) {
      throw ApplicationFailure.nonRetryable(`no route from ${current.id} for ${output}`)
    }
    current = nodeById(graph, route.to)
    prompt = route.prompt
  }
  throw ApplicationFailure.nonRetryable("graph hop cap")
}
