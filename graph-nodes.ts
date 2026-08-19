/**
 * Assumption: every node is the same — only topology and edge prompts differ.
 * "Choice" is not a node type; it is a node with multiple outgoing edges keyed by agent output.
 */
import { Effect } from "effect"

export type GraphNode = { id: string; terminal?: boolean; prompt?: string }
export type GraphEdge = { from: string; to: string; prompt: string }
export type GraphChoice = {
  at: string
  prompt: string
  outcomes: Record<string, string>
}

export type NodeGraph = {
  name: string
  entry: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  choices: GraphChoice[]
}

export const simpleGraph: NodeGraph = {
  name: "SimpleGraph",
  entry: "implement",
  nodes: [
    { id: "implement" },
    { id: "verify" },
    { id: "done", terminal: true, prompt: "Mark feature as done" }
  ],
  edges: [
    { from: "implement", to: "verify", prompt: "Implement the feature" },
    { from: "verify", to: "done", prompt: "Verify the feature" }
  ],
  choices: []
}

export const branchingGraph: NodeGraph = {
  name: "BranchingGraph",
  entry: "implement",
  nodes: [
    { id: "implement" },
    { id: "verify" },
    { id: "done", terminal: true, prompt: "Mark feature as done" },
    { id: "review", terminal: true, prompt: "Mark feature as needs review" }
  ],
  edges: [{ from: "implement", to: "verify", prompt: "Implement the feature" }],
  choices: [
    {
      at: "verify",
      prompt: "Verify the feature. Reply exactly DONE or NEEDS_REVIEW",
      outcomes: { DONE: "done", NEEDS_REVIEW: "review" }
    }
  ]
}

const runGraph = (def: NodeGraph) =>
  Effect.gen(function*() {
    let current = def.entry
    const node = (id: string) => {
      const found = def.nodes.find((n) => n.id === id)
      if (!found) throw new Error(`${def.name}: unknown node ${id}`)
      return found
    }
    while (true) {
      const here = node(current)
      if (here.terminal) {
        yield* Effect.sync(() => console.log(`  terminal: ${here.prompt ?? here.id}`))
        return
      }
      const choice = def.choices.find((c) => c.at === current)
      if (choice) {
        const keys = Object.keys(choice.outcomes)
        const answer = keys[Math.floor(Math.random() * keys.length)]!
        yield* Effect.sync(() => {
          console.log(`  agent: ${choice.prompt}`)
          console.log(`  choice: ${answer}`)
        })
        current = choice.outcomes[answer]!
        continue
      }
      const edge = def.edges.find((e) => e.from === current)
      if (!edge) throw new Error(`${def.name}: no edge from ${current}`)
      yield* Effect.sync(() => console.log(`  agent: ${edge.prompt}`))
      current = edge.to
    }
  })

export const runGraphExamples = Effect.gen(function*() {
  console.log("\n=== Node graph (homogeneous nodes, interpreted loop) ===")
  for (const def of [simpleGraph, branchingGraph]) {
    console.log(`\n--- ${def.name} ---`)
    yield* runGraph(def)
  }
})
