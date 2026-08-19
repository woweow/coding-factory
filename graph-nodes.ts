// @ts-nocheck — runtime graph compiler; types are intentionally relaxed for PoC speed.
/**
 * Assumption: a "choice" is not a separate entity.
 * Any node with >1 outgoing edges is a branching node and must route by outputKey.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

export type GraphNode = { id: string; terminal?: boolean; systemPrompt?: string }
export type GraphEdge = {
  from: string
  to: string
  prompt: string
  outputKey?: string
}

export type NodeGraph = {
  name: string
  entry: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const linearGraph: NodeGraph = {
  name: "LinearGraph",
  entry: "implementer",
  nodes: [
    { id: "implementer", systemPrompt: "You are an implementer agent." },
    { id: "reviewer", systemPrompt: "You are a reviewer agent." },
    { id: "complete", terminal: true, systemPrompt: "Workflow complete." }
  ],
  edges: [
    { from: "implementer", to: "reviewer", prompt: "Implement this feature request." },
    { from: "reviewer", to: "complete", prompt: "Create PR for this implementation." }
  ]
}

export const branchGraph: NodeGraph = {
  name: "BranchGraph",
  entry: "implementer",
  nodes: [
    { id: "implementer", systemPrompt: "You are an implementer agent." },
    { id: "reviewer", systemPrompt: "You are a reviewer agent." },
    { id: "complete", terminal: true, systemPrompt: "Feature completed." },
    { id: "fix", systemPrompt: "You are an implementer agent fixing review issues." }
  ],
  edges: [
    { from: "implementer", to: "reviewer", prompt: "Implement this feature request." },
    {
      from: "reviewer",
      to: "complete",
      prompt: "Passes review? Reply exactly PASS or FIX.",
      outputKey: "PASS"
    },
    {
      from: "reviewer",
      to: "fix",
      prompt: "Passes review? Reply exactly PASS or FIX.",
      outputKey: "FIX"
    },
    { from: "fix", to: "reviewer", prompt: "Fix review issues and resubmit." }
  ]
}

type JobChild = Record<string, { from: () => unknown }>
type Target = { from: (input: { prompt: string }, pick: (job: JobChild) => unknown) => unknown }

const goTo = (target: Target, prompt: string, next: string) =>
  target.from({ prompt }, (job) => job[next].from())

const validateGraph = (graph: NodeGraph) => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  if (!nodeIds.has(graph.entry)) throw new Error(`${graph.name}: entry node does not exist`)
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`${graph.name}: edge.from "${edge.from}" is unknown`)
    if (!nodeIds.has(edge.to)) throw new Error(`${graph.name}: edge.to "${edge.to}" is unknown`)
  }
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.from === node.id)
    if (node.terminal) {
      if (outgoing.length > 0) throw new Error(`${graph.name}: terminal node "${node.id}" cannot have outgoing edges`)
      continue
    }
    if (outgoing.length === 0) throw new Error(`${graph.name}: non-terminal node "${node.id}" needs at least one edge`)
    if (outgoing.length === 1) continue
    const keys = outgoing.map((e) => e.outputKey).filter(Boolean)
    if (keys.length !== outgoing.length) {
      throw new Error(`${graph.name}: branching node "${node.id}" requires outputKey on every outgoing edge`)
    }
    if (new Set(keys).size !== keys.length) {
      throw new Error(`${graph.name}: branching node "${node.id}" has duplicate outputKey values`)
    }
  }
}

const compileGraph = (graph: NodeGraph) => {
  validateGraph(graph)
  const childStates = Object.fromEntries(graph.nodes.map((n) => [n.id, n.terminal ? { type: "final" as const } : {}]))
  const States = Machine.states({
    Job: { schema: Job, initial: graph.entry, states: childStates }
  })
  const nodeById = Object.fromEntries(graph.nodes.map((n) => [n.id, n]))
  const states: Record<string, object> = {}

  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.from === node.id)
    if (node.terminal) {
      states[node.id] = {
        entry: () => {
          console.log(`  terminal: ${node.systemPrompt ?? node.id}`)
          return undefined
        }
      }
      continue
    }
    if (outgoing.length === 1) {
      const edge = outgoing[0]!
      const targetNode = nodeById[edge.to]
      states[node.id] = {
        invoke: Machine.invoke({
          id: `${node.id}-agent`,
          effect: () =>
            Effect.sync(() => {
              const stackedPrompt = [node.systemPrompt, edge.prompt].filter(Boolean).join("\n")
              console.log(`  node: ${node.id}`)
              console.log(`  prompt: ${stackedPrompt}`)
              return targetNode.systemPrompt ?? edge.prompt
            }),
          onDone: Machine.transition({
            target: (to) => (to.local as { with: () => unknown }).with(),
            resolve: ({ output, target }) => goTo(target as Target, output, edge.to)
          })
        })
      }
      continue
    }
    states[node.id] = {
      invoke: Machine.invoke({
        id: `${node.id}-agent`,
        effect: () =>
          Effect.sync(() => {
            const keys = outgoing.map((e) => e.outputKey!)
            const stackedPrompt = [node.systemPrompt, outgoing[0]!.prompt].filter(Boolean).join("\n")
            const pick = keys[Math.floor(Math.random() * keys.length)]!
            console.log(`  node: ${node.id}`)
            console.log(`  prompt: ${stackedPrompt}`)
            console.log(`  output key: ${pick}`)
            return pick
          }),
        onDone: Machine.transition({
          cases: (branch) =>
            outgoing.map((edge) =>
              branch({
                title: edge.outputKey!,
                when: ({ output }) => (output === edge.outputKey ? Option.some(edge.to) : Option.none()),
                target: (to) => (to.local as { with: () => unknown }).with(),
                resolve: ({ match, target }) => {
                  const targetNode = nodeById[match as string]
                  return goTo(target as Target, targetNode.systemPrompt ?? edge.prompt, match as string)
                }
              })
            ) as unknown as readonly [ReturnType<typeof branch>, ...ReturnType<typeof branch>[]],
          otherwise: { target: (to) => to.none(), resolve: () => undefined }
        })
      })
    }
  }

  return Machine.make({
    id: graph.name,
    states: States.states,
    events: Machine.events(),
    input: Job,
    initial: {
      target: (to) => to.Job.initial(),
      resolve: ({ input, target }) => goTo(target as Target, input.prompt, graph.entry)
    }
  }).handle({ Job: { states } })
}

export const runGraphExamples = Effect.gen(function*() {
  console.log("\n=== Edge-first graph (choice via multi-edge nodes, effect-machine) ===")
  for (const graph of [linearGraph, branchGraph]) {
    console.log(`\n--- ${graph.name} ---`)
    const machine = compileGraph(graph)
    const ref = yield* Machine.start(machine, new Job({ prompt: "GitHub issue" }))
    yield* ref.join
  }
})
