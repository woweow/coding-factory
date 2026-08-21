export type OutputMatch =
  | { kind: "always" }
  | { kind: "equals"; key: string; value: string }

export type Route = {
  to: string
  prompt: string
  match: OutputMatch
}

export type RoutedNode = {
  id: string
  systemPrompt?: string
  routes: Route[]
}

export type RoutedGraph = {
  name: string
  entry: string
  nodes: RoutedNode[]
}

export const branchGraph: RoutedGraph = {
  name: "BranchGraph",
  entry: "implementer",
  nodes: [
    {
      id: "implementer",
      systemPrompt: "You implement code changes.",
      routes: [
        {
          to: "reviewer",
          prompt: "Passes review? Reply exactly PASS or FIX.",
          match: { kind: "equals", key: "decision", value: "CONTINUE" }
        }
      ]
    },
    {
      id: "reviewer",
      systemPrompt: "You review and decide pass/fix.",
      routes: [
        {
          to: "complete",
          prompt: "Mark feature as complete.",
          match: { kind: "equals", key: "decision", value: "PASS" }
        },
        {
          to: "implementer",
          prompt: "Fix the issues from review.",
          match: { kind: "equals", key: "decision", value: "FIX" }
        }
      ]
    },
    { id: "complete", systemPrompt: "Feature completed.", routes: [] }
  ]
}

export const isTerminal = (node: RoutedNode) => node.routes.length === 0

export const nodeById = (graph: RoutedGraph, id: string): RoutedNode => {
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`${graph.name}: unknown node ${id}`)
  return node
}

export const routeChoices = (routes: Route[]): string[] =>
  routes.map((r) => (r.match.kind === "equals" ? r.match.value : r.to))

export const matchRoute = (routes: Route[], output: string): Route | undefined =>
  routes.find((r) => r.match.kind === "always" || (r.match.kind === "equals" && r.match.value === output))

export const validateGraph = (graph: RoutedGraph) => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  if (!nodeIds.has(graph.entry)) throw new Error(`${graph.name}: entry node does not exist`)
  for (const node of graph.nodes) {
    for (const route of node.routes) {
      if (!nodeIds.has(route.to)) throw new Error(`${graph.name}: unknown route target "${route.to}"`)
    }
  }
}
