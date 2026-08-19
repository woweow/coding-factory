import { Machine } from "@typeonce/effect-machine"
import * as readline from "node:readline/promises"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

const verifyPrompt = (feature: string) => `Verify the feature: ${feature}`

const States = Machine.states({
  Job: {
    schema: Job,
    initial: "Implementing",
    states: {
      Implementing: {},
      Verifying: {},
      Done: {},
      NeedsReview: {}
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
        entry: ({ containingState }) => {
          console.log(`agent: implementing "${containingState.prompt}"`)
          return undefined
        },
        always: Machine.transition({
          target: (to) => to.local.with(),
          resolve: ({ containingState, target }) =>
            target.from({ prompt: verifyPrompt(containingState.prompt) }, (job) => job.Verifying.from())
        })
      },
      Verifying: {
        entry: ({ containingState }) => {
          console.log(`agent: verifying "${containingState.prompt}"`)
          return undefined
        },
        always: Machine.transition({
          cases: (branch) => [
            branch({
              title: "even",
              when: () => {
                const roll = Math.floor(Math.random() * 100)
                return roll % 2 === 0 ? Option.some(roll) : Option.none()
              },
              target: (to) => to.local.with(),
              resolve: ({ containingState, target }) => {
                const feature = containingState.prompt.slice("Verify the feature: ".length)
                return target.from({ prompt: `Done: ${feature}` }, (job) => job.Done.from())
              }
            })
          ],
          otherwise: {
            target: (to) => to.local.with(),
            resolve: ({ containingState, target }) => {
              const feature = containingState.prompt.slice("Verify the feature: ".length)
              return target.from({ prompt: `Needs review: ${feature}` }, (job) => job.NeedsReview.from())
            }
          }
        })
      },
      Done: {
        entry: ({ containingState }) => {
          console.log(`done: "${containingState.prompt}"`)
          return undefined
        }
      },
      NeedsReview: {
        entry: ({ containingState }) => {
          console.log(`needs review: "${containingState.prompt}"`)
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
    yield* Machine.start(Factory, new Job({ prompt }))
  }
})

await Effect.runPromise(Effect.scoped(program))
