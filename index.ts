import { Machine } from "@typeonce/effect-machine"
import * as readline from "node:readline/promises"
import { Effect, Option, Schema } from "effect"

class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  prompt: Schema.String
}) {}

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
        always: Machine.transition({
          target: (to) => to.local.with(),
          resolve: ({ containingState, target }) => {
            console.log(`agent: implementing "${containingState.prompt}"`)
            return target.from({ prompt: "Implement the feature" }, (job) => job.Verifying.from())
          }
        })
      },
      Verifying: {
        always: Machine.transition({
          cases: (branch) => [
            branch({
              title: "even",
              when: () => {
                const roll = Math.floor(Math.random() * 100)
                console.log(`agent: verifying (roll ${roll})`)
                return roll % 2 === 0 ? Option.some(roll) : Option.none()
              },
              target: (to) => to.local.with(),
              resolve: ({ target }) =>
                target.from({ prompt: "Verify the feature" }, (job) => job.Done.from())
            })
          ],
          otherwise: {
            target: (to) => to.local.with(),
            resolve: ({ target }) =>
              target.from({ prompt: "Verify the feature" }, (job) => job.NeedsReview.from())
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
