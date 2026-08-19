// @ts-nocheck — runtime graph compiler; types are erased on purpose for this PoC.
/**
 * Assumption: workflows are an ordered list of named step *kinds*.
 * Users pick from agent | choice | terminal — not a freeform graph.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

export type PipelineStep =
  | { kind: "agent"; id: string; prompt: string; next: string }
  | { kind: "choice"; id: string; prompt: string; outcomes: Record<string, string> }
  | { kind: "terminal"; id: string; prompt: string }

export type PipelineDefinition = {
  name: string
  entry: string
  steps: PipelineStep[]
}

export const linearPipeline: PipelineDefinition = {
  name: "LinearPipeline",
  entry: "implement",
  steps: [
    { kind: "agent", id: "implement", prompt: "Implement the feature", next: "verify" },
    { kind: "agent", id: "verify", prompt: "Verify the feature", next: "done" },
    { kind: "terminal", id: "done", prompt: "Mark feature as done" }
  ]
}

export const choicePipeline: PipelineDefinition = {
  name: "ChoicePipeline",
  entry: "implement",
  steps: [
    { kind: "agent", id: "implement", prompt: "Implement the feature", next: "verify" },
    {
      kind: "choice",
      id: "verify",
      prompt: "Verify the feature. Reply exactly DONE or NEEDS_REVIEW",
      outcomes: { DONE: "done", NEEDS_REVIEW: "review" }
    },
    { kind: "terminal", id: "done", prompt: "Mark feature as done" },
    { kind: "terminal", id: "review", prompt: "Mark feature as needs review" }
  ]
}

type JobChild = Record<string, { from: () => unknown }>

const goTo = (target: { from: (input: { prompt: string }, pick: (job: JobChild) => unknown) => unknown }, prompt: string, next: string) =>
  target.from({ prompt }, (job) => job[next].from())

const compilePipeline = (def: PipelineDefinition) => {
  const childStates = Object.fromEntries(
    def.steps.map((step) => [step.id, step.kind === "terminal" ? { type: "final" as const } : {}])
  )
  const States = Machine.states({
    Job: { schema: Job, initial: def.entry, states: childStates }
  })
  const states: Record<string, object> = {}
  for (const step of def.steps) {
    if (step.kind === "agent") {
      states[step.id] = {
        invoke: Machine.invoke({
          id: `${step.id}-agent`,
          effect: () =>
            Effect.sync(() => {
              console.log(`  agent: ${step.prompt}`)
              return step.prompt
            }),
          onDone: Machine.transition({
            target: (to) => (to.local as { with: () => unknown }).with(),
            resolve: ({ target }) => goTo(target as Parameters<typeof goTo>[0], step.prompt, step.next)
          })
        })
      }
    } else if (step.kind === "choice") {
      const routes = step.outcomes
      states[step.id] = {
        invoke: Machine.invoke({
          id: `${step.id}-agent`,
          effect: () =>
            Effect.sync(() => {
              console.log(`  agent: ${step.prompt}`)
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
                  resolve: ({ match, target }) => goTo(target as Parameters<typeof goTo>[0], step.prompt, match as string)
                })
              ) as unknown as readonly [ReturnType<typeof branch>, ...ReturnType<typeof branch>[]],
            otherwise: { target: (to) => to.none(), resolve: () => undefined }
          })
        })
      }
    } else {
      states[step.id] = {
        entry: () => {
          console.log(`  terminal: ${step.prompt}`)
          return undefined
        }
      }
    }
  }
  return Machine.make({
    id: def.name,
    states: States.states,
    events: Machine.events(),
    input: Job,
    initial: {
      target: (to) => to.Job.initial(),
      resolve: ({ input, target }) =>
        goTo(target as Parameters<typeof goTo>[0], input.prompt, def.entry)
    }
  }).handle({ Job: { states } })
}

export const runPipelineExamples = Effect.gen(function*() {
  console.log("\n=== Pipeline schema (typed step kinds) ===")
  for (const def of [linearPipeline, choicePipeline]) {
    console.log(`\n--- ${def.name} ---`)
    const machine = compilePipeline(def)
    const ref = yield* Machine.start(machine, new Job({ prompt: "user request" }))
    yield* ref.join
  }
})
