// @ts-nocheck — runtime graph compiler; types intentionally relaxed for PoC speed.
/**
 * Node-owned routes. Each route.prompt is the edge prompt handed TO the next node.
 * Work at a node uses: systemPrompt + incoming edge prompt.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Option, Schema } from "effect"

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
          match: { kind: "always" }
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
type Target = { from: (input: { edgePrompt: string }, pick: (job: JobChild) => unknown) => unknown }

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
    if (node.routes.length === 1) continue
    const values = node.routes
      .map((r) => (r.match.kind === "equals" ? r.match.value : undefined))
      .filter(Boolean)
    if (values.length !== node.routes.length) {
      throw new Error(`${graph.name}: branching node "${node.id}" requires equals match on every route`)
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`${graph.name}: branching node "${node.id}" has duplicate match values`)
    }
  }
}

const compileGraph = (graph: RoutedGraph) => {
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
    if (routes.length === 1) {
      const route = routes[0]!
      states[node.id] = {
        entry: () => {
          console.log(`  entering ${node.id}`)
          return undefined
        },
        invoke: Machine.invoke({
          id: `${node.id}-agent`,
          effect: ({ containingState }) =>
            Effect.sync(() => {
              workLog(node.systemPrompt, containingState.edgePrompt)
              return route.match.kind === "always" ? "done" : route.match.value
            }),
          onDone: Machine.transition({
            target: (to) => (to.local as { with: () => unknown }).with(),
            resolve: ({ target }) => goTo(target as Target, route.prompt, route.to)
          })
        })
      }
      continue
    }

    states[node.id] = {
      entry: () => {
        console.log(`  entering ${node.id}`)
        return undefined
      },
      invoke: Machine.invoke({
        id: `${node.id}-agent`,
        effect: ({ containingState }) =>
          Effect.sync(() => {
            workLog(node.systemPrompt, containingState.edgePrompt)
            const values = routes.map((r) => r.match.value)
            return values[Math.floor(Math.random() * values.length)]!
          }),
        onDone: Machine.transition({
          cases: (branch) =>
            routes.map((route) =>
              branch({
                title: route.match.value,
                when: ({ output }) =>
                  route.match.kind === "equals" && output === route.match.value
                    ? Option.some(route.to)
                    : Option.none(),
                target: (to) => (to.local as { with: () => unknown }).with(),
                resolve: ({ match, target }) => goTo(target as Target, route.prompt, match as string)
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
      resolve: ({ input, target }) => goTo(target as Target, input.edgePrompt, graph.entry)
    }
  }).handle({ Job: { states } })
}

export const runGraph = Effect.gen(function* () {
  const machine = compileGraph(branchGraph)
  const ref = yield* Machine.start(machine, new Job({ edgePrompt: "Implement this feature request." }))
  yield* ref.join
})
