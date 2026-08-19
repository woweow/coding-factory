// @ts-nocheck — runtime graph compiler; types intentionally relaxed for PoC speed.
/**
 * Node-owned routes. Each route.prompt is the edge prompt handed TO the next node.
 * For external callback pattern (emit + event resume), see external-callback-example.ts.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  edgePrompt: Schema.String
}) {}

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
  terminal?: boolean
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
    { id: "complete", terminal: true, systemPrompt: "Feature completed.", routes: [] }
  ]
}

type JobChild = Record<string, { from: () => unknown }>
type Target = {
  from: (input: { edgePrompt: string }, pick: (job: JobChild) => unknown) => unknown
}

const goTo = (target: Target, edgePrompt: string, next: string) =>
  target.from({ edgePrompt }, (job) => job[next].from())

const workLog = (systemPrompt: string | undefined, edgePrompt: string) => {
  console.log(`  system prompt: ${systemPrompt ?? ""} ... edge prompt: ${edgePrompt}`)
}

const validateGraph = (graph: RoutedGraph) => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  if (!nodeIds.has(graph.entry)) throw new Error(`${graph.name}: entry node does not exist`)
  for (const node of graph.nodes) {
    if (node.terminal) {
      if (node.routes.length > 0) throw new Error(`${graph.name}: terminal node "${node.id}" cannot have routes`)
      continue
    }
    if (node.routes.length === 0) throw new Error(`${graph.name}: non-terminal node "${node.id}" needs routes`)
    for (const route of node.routes) {
      if (!nodeIds.has(route.to)) throw new Error(`${graph.name}: unknown route target "${route.to}"`)
    }
  }
}

const mockOutput = (routes: Route[]) => {
  const choices = routes.map((r) => (r.match.kind === "equals" ? r.match.value : "done"))
  return choices[Math.floor(Math.random() * choices.length)]!
}

export const compileGraph = (graph: RoutedGraph) => {
  validateGraph(graph)
  const childStates = Object.fromEntries(
    graph.nodes.map((n) => [n.id, n.terminal ? { type: "final" as const } : {}])
  )
  const States = Machine.states({
    Job: { schema: Job, initial: graph.entry, states: childStates }
  })
  const states: Record<string, object> = {}

  for (const node of graph.nodes) {
    if (node.terminal) {
      states[node.id] = {
        entry: () => {
          console.log(`  entering ${node.id}`)
          return undefined
        }
      }
      continue
    }

    const routes = node.routes
    states[node.id] = {
      entry: () => {
        console.log(`  entering ${node.id}`)
        return undefined
      },
      invoke: (from) =>
        from
          .effect(`${node.id}-agent`, ({ containingState }) =>
            Effect.sync(() => {
              workLog(node.systemPrompt, containingState.edgePrompt)
              return mockOutput(routes)
            })
          )
          .onDone((to) => {
            const branchSpec: Record<string, { title: string; target: unknown }> = {
              none: { target: to.none }
            }
            for (const route of routes) {
              const key = route.match.kind === "equals" ? route.match.value : route.to
              branchSpec[key] = { title: key, target: to.local.with }
            }
            return to.branches(branchSpec).resolve(({ output, select, containingState }) => {
              for (const route of routes) {
                if (route.match.kind === "equals" && output === route.match.value) {
                  return select[route.match.value].from(
                    { edgePrompt: route.prompt },
                    (job) => job[route.to].from()
                  )
                }
              }
              return select.none()
            })
          })
    }
  }

  return Machine.make({
    id: graph.name,
    states: States.states,
    events: Machine.events(),
    input: Job,
    initial: (to) =>
      to.Job.initial.resolve(({ input, target }) => goTo(target as Target, input.edgePrompt, graph.entry))
  }).handle({ Job: { states } })
}

export const launchGraph = (graph: RoutedGraph, edgePrompt: string): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const ref = yield* Machine.start(compileGraph(graph), new Job({ edgePrompt }))
      yield* ref.join
    })
  )
