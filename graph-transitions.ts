// @ts-nocheck — runtime graph compiler; types are erased on purpose for this PoC.
/**
 * Assumption: users think in statechart transitions, not nodes or pipelines.
 * Supports loops via choose routes that point backward.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

export type AgentTransition =
  | { kind: "invoke"; from: string; prompt: string; to: string }
  | { kind: "choose"; from: string; prompt: string; routes: Record<string, string> }
  | { kind: "halt"; at: string; prompt: string }

export type TransitionChart = {
  name: string
  initial: string
  transitions: AgentTransition[]
}

export const releaseChart: TransitionChart = {
  name: "ReleaseChart",
  initial: "implement",
  transitions: [
    { kind: "invoke", from: "implement", prompt: "Implement the feature", to: "verify" },
    {
      kind: "choose",
      from: "verify",
      prompt: "Verify the feature. Reply exactly DONE or NEEDS_REVIEW",
      routes: { DONE: "done", NEEDS_REVIEW: "review" }
    },
    { kind: "halt", at: "done", prompt: "Mark feature as done" },
    { kind: "halt", at: "review", prompt: "Mark feature as needs review" }
  ]
}

export const reviseChart: TransitionChart = {
  name: "ReviseChart",
  initial: "draft",
  transitions: [
    { kind: "invoke", from: "draft", prompt: "Write the draft", to: "review" },
    {
      kind: "choose",
      from: "review",
      prompt: "Review the draft. Reply exactly APPROVE or REVISE",
      routes: { APPROVE: "publish", REVISE: "draft" }
    },
    { kind: "halt", at: "publish", prompt: "Publish the feature" }
  ]
}

type JobChild = Record<string, { from: () => unknown }>
type Target = { from: (input: { prompt: string }, pick: (job: JobChild) => unknown) => unknown }

const goTo = (target: Target, prompt: string, next: string) =>
  target.from({ prompt }, (job) => job[next].from())

const stateIds = (chart: TransitionChart) => {
  const ids = new Set<string>([chart.initial])
  for (const t of chart.transitions) {
    if (t.kind === "halt") ids.add(t.at)
    else if (t.kind === "invoke") {
      ids.add(t.from)
      ids.add(t.to)
    } else {
      ids.add(t.from)
      for (const to of Object.values(t.routes)) ids.add(to)
    }
  }
  return [...ids]
}

const compileChart = (chart: TransitionChart) => {
  const ids = stateIds(chart)
  const childStates = Object.fromEntries(
    ids.map((id) => [id, chart.transitions.some((t) => t.kind === "halt" && t.at === id) ? { type: "final" as const } : {}])
  )
  const States = Machine.states({
    Job: { schema: Job, initial: chart.initial, states: childStates }
  })
  const invokeAt = (from: string) => {
    const t = chart.transitions.find((x) => x.kind === "invoke" && x.from === from)
    return t?.kind === "invoke" ? t : undefined
  }
  const chooseAt = (from: string) => {
    const t = chart.transitions.find((x) => x.kind === "choose" && x.from === from)
    return t?.kind === "choose" ? t : undefined
  }
  const haltAt = (at: string) => {
    const t = chart.transitions.find((x) => x.kind === "halt" && x.at === at)
    return t?.kind === "halt" ? t : undefined
  }
  const states: Record<string, object> = {}
  for (const id of ids) {
    const invoke = invokeAt(id)
    const choose = chooseAt(id)
    const halt = haltAt(id)
    if (invoke) {
      states[id] = {
        invoke: Machine.invoke({
          id: `${id}-agent`,
          effect: () =>
            Effect.sync(() => {
              console.log(`  agent: ${invoke.prompt}`)
              return invoke.prompt
            }),
          onDone: Machine.transition({
            target: (to) => (to.local as { with: () => unknown }).with(),
            resolve: ({ target }) => goTo(target as Target, invoke.prompt, invoke.to)
          })
        })
      }
    } else if (choose) {
      const routes = choose.routes
      states[id] = {
        invoke: Machine.invoke({
          id: `${id}-agent`,
          effect: () =>
            Effect.sync(() => {
              console.log(`  agent: ${choose.prompt}`)
              const keys = Object.keys(routes)
              const pick = keys[Math.floor(Math.random() * keys.length)]!
              console.log(`  choice: ${pick}`)
              return pick
            }),
          onDone: Machine.transition({
            cases: (branch) =>
              Object.entries(routes).map(([answer, targetId]) =>
                branch({
                  title: answer,
                  when: ({ output }) => (output === answer ? Option.some(targetId) : Option.none()),
                  target: (to) => (to.local as { with: () => unknown }).with(),
                  resolve: ({ match, target }) => goTo(target as Target, choose.prompt, match as string)
                })
              ) as unknown as readonly [ReturnType<typeof branch>, ...ReturnType<typeof branch>[]],
            otherwise: { target: (to) => to.none(), resolve: () => undefined }
          })
        })
      }
    } else if (halt) {
      states[id] = {
        entry: () => {
          console.log(`  terminal: ${halt.prompt}`)
          return undefined
        }
      }
    }
  }
  return Machine.make({
    id: chart.name,
    states: States.states,
    events: Machine.events(),
    input: Job,
    initial: {
      target: (to) => to.Job.initial(),
      resolve: ({ input, target }) => goTo(target as Target, input.prompt, chart.initial)
    }
  }).handle({ Job: { states } })
}

export const runTransitionExamples = Effect.gen(function*() {
  console.log("\n=== Transition chart (statechart table, supports loops) ===")
  for (const chart of [releaseChart, reviseChart]) {
    console.log(`\n--- ${chart.name} ---`)
    const machine = compileChart(chart)
    const ref = yield* Machine.start(machine, new Job({ prompt: "user request" }))
    yield* ref.join
  }
})
