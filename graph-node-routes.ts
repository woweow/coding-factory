// @ts-nocheck — runtime graph compiler; types intentionally relaxed for PoC speed.
/**
 * Node-owned routes. Each route.prompt is the edge prompt handed TO the next node.
 * Pause routes emit NeedInput and wait for Resume — input collection is external.
 */
import { Machine } from "@typeonce/effect-machine"
import { Deferred, Effect, Option, Schema, Stream } from "effect"

const HUMAN_MESSAGE = "What is your favorite color?"
const AWAITING = "__awaitingInput"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  edgePrompt: Schema.String,
  returnNode: Schema.optional(Schema.String),
  humanMessage: Schema.optional(Schema.String)
}) {}

class Resume extends Schema.TaggedClass<Resume>("Resume")("Resume", {
  text: Schema.String
}) {}

class NeedInput extends Schema.TaggedClass<NeedInput>("NeedInput")("NeedInput", {
  message: Schema.String,
  returnNode: Schema.String
}) {}

const GraphEvents = Machine.events(Resume)
const GraphEmissions = Machine.emittedEvents(NeedInput)

export type HumanInputRequest = {
  message: string
  returnNode: string
}

export type OutputMatch =
  | { kind: "always" }
  | { kind: "equals"; key: string; value: string }

export type Route = {
  to?: string
  prompt?: string
  pause?: boolean
  message?: string
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
        },
        {
          pause: true,
          match: { kind: "equals", key: "decision", value: "HUMAN" }
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
type Target = { from: (input: { edgePrompt: string; returnNode?: string; humanMessage?: string }, pick: (job: JobChild) => unknown) => unknown }

const goTo = (target: Target, edgePrompt: string, next: string) =>
  target.from({ edgePrompt }, (job) => job[next].from())

const goToAwaiting = (target: Target, edgePrompt: string, returnNode: string, message: string) =>
  target.from({ edgePrompt, returnNode, humanMessage: message }, (job) => job[AWAITING].from())

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
      if (route.pause) continue
      if (!route.to) throw new Error(`${graph.name}: route from "${node.id}" needs to`)
      if (!route.prompt) throw new Error(`${graph.name}: route from "${node.id}" to "${route.to}" needs prompt`)
      if (!nodeIds.has(route.to)) throw new Error(`${graph.name}: unknown route target "${route.to}"`)
    }
  }
}

const mockOutput = (routes: Route[]) => {
  const choices = routes.map((r) => (r.match.kind === "equals" ? r.match.value : "done"))
  return choices[Math.floor(Math.random() * choices.length)]!
}

const compileGraph = (graph: RoutedGraph) => {
  validateGraph(graph)
  const childStates = Object.fromEntries(
    graph.nodes.map((n) => [n.id, n.terminal ? { type: "final" as const } : {}])
  )
  childStates[AWAITING] = {}
  const States = Machine.states({
    Job: { schema: Job, initial: graph.entry, states: childStates }
  })
  const states: Record<string, object> = {}

  states[AWAITING] = {
    entry: (state, enqueue) => {
      console.log(`  entering ${AWAITING}`)
      const message = state.humanMessage ?? HUMAN_MESSAGE
      enqueue.emit(GraphEmissions.NeedInput({ message, returnNode: state.returnNode ?? graph.entry }))
      return undefined
    },
    on: {
      Resume: Machine.transition({
        target: (to) => (to.local as { with: () => unknown }).with(),
        resolve: ({ event, state, containingState, target }) => {
          const ctx = state ?? containingState
          const returnNode = ctx.returnNode ?? graph.entry
          console.log(`  resume at ${returnNode} with: ${event.text}`)
          return goTo(target as Target, event.text, returnNode)
        }
      })
    }
  }

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
      invoke: Machine.invoke({
        id: `${node.id}-agent`,
        effect: ({ containingState }) =>
          Effect.gen(function* () {
            workLog(node.systemPrompt, containingState.edgePrompt)
            const pick = mockOutput(routes)
            const pauseRoute = routes.find(
              (r) => r.pause && r.match.kind === "equals" && r.match.value === pick
            )
            if (pauseRoute) {
              const message = pauseRoute.message ?? HUMAN_MESSAGE
              console.log(`  agent response: ${message}`)
              return { tag: "human" as const, message }
            }
            return { tag: "route" as const, value: pick }
          }),
        onDone: Machine.transition({
          cases: (branch) =>
            [
              branch({
                title: "human",
                when: ({ output }) => (output.tag === "human" ? Option.some(AWAITING) : Option.none()),
                target: (to) => (to.local as { with: () => unknown }).with(),
                resolve: ({ output, containingState, target }) =>
                  goToAwaiting(target as Target, containingState.edgePrompt, node.id, output.message)
              }),
              ...routes
                .filter((r) => !r.pause)
                .map((route) =>
                  branch({
                    title: route.match.value ?? route.to,
                    when: ({ output }) =>
                      output.tag === "route" &&
                      (route.match.kind === "always" ||
                        (route.match.kind === "equals" && output.value === route.match.value))
                        ? Option.some(route.to!)
                        : Option.none(),
                    target: (to) => (to.local as { with: () => unknown }).with(),
                    resolve: ({ match, target }) => goTo(target as Target, route.prompt!, match as string)
                  })
                )
            ] as unknown as readonly [ReturnType<typeof branch>, ...ReturnType<typeof branch>[]],
          otherwise: { target: (to) => to.none(), resolve: () => undefined }
        })
      })
    }
  }

  return Machine.make({
    id: graph.name,
    states: States.states,
    events: GraphEvents,
    emittedEvents: GraphEmissions,
    input: Job,
    initial: {
      target: (to) => to.Job.initial(),
      resolve: ({ input, target }) => goTo(target as Target, input.edgePrompt, graph.entry)
    }
  }).handle({ Job: { states } })
}

/**
 * Run a graph. When the machine pauses, `provideInput` is called (outside Effect).
 * Return text to resume; the host sends Resume internally.
 */
export const launchGraph = (
  graph: RoutedGraph,
  edgePrompt: string,
  provideInput: (request: HumanInputRequest) => Promise<string>
): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const prepared = yield* Machine.prepare(compileGraph(graph), new Job({ edgePrompt }))
      const refSlot = yield* Deferred.make()

      yield* prepared.emissions.pipe(
        Stream.runForEach((need) =>
          Effect.gen(function* () {
            const text = yield* Effect.promise(() =>
              provideInput({ message: need.message, returnNode: need.returnNode })
            )
            const ref = yield* Deferred.await(refSlot)
            yield* ref.send(GraphEvents.Resume({ text }))
          })
        ),
        Effect.forkChild({ startImmediately: true })
      )

      const ref = yield* prepared.start
      yield* Deferred.succeed(refSlot, ref)
      yield* ref.join
    })
  )
