/**
 * Option 3: Node-owned routes.
 * A node carries its outgoing routes inline, so relationships are grouped by node.
 */

export type Route = {
  to: string
  prompt: string
  outputKey?: string
}

export type RoutedNode = {
  id: string
  terminal?: boolean
  systemPrompt?: string
  routes: Route[]
}

export type RoutedGraph = {
  name: string
  entry: string
  nodes: RoutedNode[]
}

export const linearRoutedGraph: RoutedGraph = {
  name: "LinearRoutedGraph",
  entry: "implementer",
  nodes: [
    {
      id: "implementer",
      systemPrompt: "You implement code changes.",
      routes: [{ to: "reviewer", prompt: "Implement this feature request." }]
    },
    {
      id: "reviewer",
      systemPrompt: "You review code changes.",
      routes: [{ to: "complete", prompt: "Create PR for this implementation." }]
    },
    { id: "complete", terminal: true, systemPrompt: "Workflow complete.", routes: [] }
  ]
}

export const branchRoutedGraph: RoutedGraph = {
  name: "BranchRoutedGraph",
  entry: "implementer",
  nodes: [
    {
      id: "implementer",
      systemPrompt: "You implement code changes.",
      routes: [{ to: "reviewer", prompt: "Implement this feature request." }]
    },
    {
      id: "reviewer",
      systemPrompt: "You review and decide pass/fix.",
      routes: [
        {
          to: "complete",
          prompt: "Passes review? Reply exactly PASS or FIX.",
          outputKey: "PASS"
        },
        {
          to: "fix",
          prompt: "Passes review? Reply exactly PASS or FIX.",
          outputKey: "FIX"
        }
      ]
    },
    {
      id: "fix",
      systemPrompt: "You fix issues from review.",
      routes: [{ to: "reviewer", prompt: "Fix the issues and resubmit." }]
    },
    { id: "complete", terminal: true, systemPrompt: "Feature completed.", routes: [] }
  ]
}
