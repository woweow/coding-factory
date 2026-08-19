import { Machine } from "@typeonce/effect-machine"
import * as readline from "node:readline/promises"
import { Effect, Option, Schema } from "effect"

const Ticket = Schema.Struct({ id: Schema.Number })

const State = Schema.TaggedUnion({
  Implementing: { id: Schema.Number },
  Verifying: { id: Schema.Number },
  Done: { id: Schema.Number },
  NeedsReview: { id: Schema.Number }
})

const States = Machine.states(State.cases)

const TicketMachine = Machine.make({
  id: "Ticket",
  states: States.states,
  events: Machine.events(),
  input: Ticket,
  initial: {
    target: (to) => to.Implementing(),
    resolve: ({ input, target }) => {
      console.log(`ticket ${input.id}: implementing`)
      return target.from({ id: input.id })
    }
  }
}).handle({
  Implementing: {
    always: Machine.transition({
      target: (to) => to.full.Verifying(),
      resolve: ({ state, target }) => {
        console.log(`ticket ${state.id}: verifying`)
        return target.from({ id: state.id })
      }
    })
  },
  Verifying: {
    always: Machine.transition({
      cases: (branch) => [
        branch({
          title: "even",
          when: ({ state }) => state.id % 2 === 0 ? Option.some(undefined) : Option.none(),
          target: (to) => to.full.Done(),
          resolve: ({ state, target }) => {
            console.log(`ticket ${state.id}: done`)
            return target.from({ id: state.id })
          }
        })
      ],
      otherwise: {
        target: (to) => to.full.NeedsReview(),
        resolve: ({ state, target }) => {
          console.log(`ticket ${state.id}: needs review`)
          return target.from({ id: state.id })
        }
      }
    })
  },
  Done: {},
  NeedsReview: {}
})

const program = Effect.gen(function*() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  while (true) {
    const input = yield* Effect.promise(() => rl.question("ticket id> "))
    if (input === "exit") {
      rl.close()
      return
    }
    yield* Machine.start(TicketMachine, { id: Number(input) })
  }
})

await Effect.runPromise(Effect.scoped(program))
