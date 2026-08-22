// @ts-nocheck — runtime graph compiler; types intentionally relaxed for PoC speed.
/**
 * Node-owned routes. Each route.prompt is the edge prompt handed TO the next node.
 * A node with no routes is terminal — no explicit flag needed.
 * For external callback pattern (emit + event resume), see external-callback-example.ts.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Schema } from "effect"
import { validateGraph, type Route, type RoutedGraph } from "./graph.ts"

export type { OutputMatch, Route, RoutedGraph, RoutedNode } from "./graph.ts"
export { branchGraph } from "./graph.ts"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  edgePrompt: Schema.String
}) {}

type JobChild = Record<string, { from: () => unknown }>
type Target = {
  from: (input: { edgePrompt: string }, pick: (job: JobChild) => unknown) => unknown
}

const goTo = (target: Target, edgePrompt: string, next: string) =>
  target.from({ edgePrompt }, (job) => job[next].from())

const workLog = (systemPrompt: string | undefined, edgePrompt: string) => {
  console.log(`  system prompt: ${systemPrompt ?? ""} ... edge prompt: ${edgePrompt}`)
}

const mockOutput = (routes: Route[]) => {
  const choices = routes.map((r) => (r.match.kind === "equals" ? r.match.value : "done"))
  return choices[Math.floor(Math.random() * choices.length)]!
}

export const compileGraph = (graph: RoutedGraph) => {
  validateGraph(graph)
  const childStates = Object.fromEntries(
    graph.nodes.map((n) => [n.id, n.routes.length === 0 ? { type: "final" as const } : {}])
  )
  const States = Machine.states({
    Job: { schema: Job, initial: graph.entry, states: childStates }
  })
  const states: Record<string, object> = {}

  for (const node of graph.nodes) {
    const routes = node.routes
    const handler: Record<string, unknown> = {
      entry: ({ containingState }) => {
        console.log(`  entering ${node.id}`)
        workLog(node.systemPrompt, containingState.edgePrompt)
        return undefined
      }
    }

    if (routes.length > 0) {
      handler.invoke = (from) =>
        from
          .effect(`${node.id}-agent`, () => Effect.sync(() => mockOutput(routes)))
          .onDone((to) => {
            const branchSpec: Record<string, { title: string; target: unknown }> = {
              none: { target: to.none }
            }
            for (const route of routes) {
              const key = route.match.kind === "equals" ? route.match.value : route.to
              branchSpec[key] = { title: key, target: to.local.with }
            }
            return to.branches(branchSpec).resolve(({ output, select }) => {
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

    states[node.id] = handler
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
