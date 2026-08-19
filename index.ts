import { Machine } from "@typeonce/effect-machine"
import * as readline from "node:readline/promises"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

const verifyPrompt = (feature: string) => `Verify the feature: ${feature}`
const featureFromVerify = (prompt: string) => prompt.slice("Verify the feature: ".length)

const States = Machine.states({
  Job: {
    schema: Job,
    initial: "Implementing",
    states: {
      Implementing: {},
      Verifying: {},
      Done: { type: "final" },
      NeedsReview: { type: "final" }
    }
  }
})

const Factory = Machine.make({
  id: "CodingFactory",
  states: States.states,
  events: Machine.events(),
  input: Job,
  initial: {
    target: (to) => to.Job.initial(),
    resolve: ({ input, target }) =>
      target.from({ prompt: input.prompt }, (job) => job.Implementing.from())
  }
}).handle({
  Job: {
    states: {
      Implementing: {
        invoke: Machine.invoke({
          id: "implement-agent",
          effect: ({ containingState }) =>
            Effect.sync(() => {
              console.log(`agent: implementing "${containingState.prompt}"`)
              return verifyPrompt(containingState.prompt)
            }),
          onDone: Machine.transition({
            target: (to) => to.local.with(),
            resolve: ({ output, target }) =>
              target.from({ prompt: output }, (job) => job.Verifying.from())
          })
        })
      },
      Verifying: {
        invoke: Machine.invoke({
          id: "verify-agent",
          effect: ({ containingState }) =>
            Effect.sync(() => {
              console.log(`agent: verifying "${containingState.prompt}"`)
              const roll = Math.floor(Math.random() * 100)
              return {
                approved: roll % 2 === 0,
                feature: featureFromVerify(containingState.prompt)
              }
            }),
          onDone: Machine.transition({
            cases: (branch) => [
              branch({
                title: "approved",
                when: ({ output }) => output.approved ? Option.some(output.feature) : Option.none(),
                target: (to) => to.local.with(),
                resolve: ({ match, target }) =>
                  target.from({ prompt: `Mark feature as done: ${match}` }, (job) => job.Done.from())
              })
            ],
            otherwise: {
              target: (to) => to.local.with(),
              resolve: ({ output, target }) =>
                target.from(
                  { prompt: `Mark feature as needs review: ${output.feature}` },
                  (job) => job.NeedsReview.from()
                )
            }
          })
        })
      },
      Done: {
        entry: ({ containingState }) => {
          const feature = containingState.prompt.slice("Mark feature as done: ".length)
          console.log(`done: "Marked as done: ${feature}"`)
          return undefined
        }
      },
      NeedsReview: {
        entry: ({ containingState }) => {
          const feature = containingState.prompt.slice("Mark feature as needs review: ".length)
          console.log(`needs review: "Marked as needs review: ${feature}"`)
          return undefined
        }
      }
    }
  }
})

const program = Effect.gen(function*() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  while (true) {
    const prompt = yield* Effect.promise(() => rl.question("prompt> "))
    if (prompt === "exit") {
      rl.close()
      return
    }
    const ref = yield* Machine.start(Factory, new Job({ prompt }))
    yield* ref.join
  }
})

await Effect.runPromise(Effect.scoped(program))
