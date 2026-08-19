import { Machine } from "@typeonce/effect-machine"
import * as readline from "node:readline/promises"
import { Effect, Option, Schema } from "effect"

class Ticket extends Schema.TaggedClass<Ticket>("Ticket")("Ticket", {
  id: Schema.Number
}) {}

const States = Machine.states({
  Ticket: {
    schema: Ticket,
    initial: "Implementing",
    states: {
      Implementing: {},
      Verifying: {},
      Done: {},
      NeedsReview: {}
    }
  }
})

const TicketMachine = Machine.make({
  id: "TicketMachine",
  states: States.states,
  events: Machine.events(),
  input: Ticket,
  initial: {
    target: (to) => to.Ticket.initial(),
    resolve: ({ input, target }) =>
      target.from({ id: input.id }, (ticket) => ticket.Implementing.from())
  }
}).handle({
  Ticket: {
    states: {
      Implementing: {
        always: Machine.transition({
          target: (to) => to.local.Verifying(),
          resolve: ({ containingState, target }) => {
            console.log(`ticket ${containingState.id}: implementing`)
            return target.from()
          }
        })
      },
      Verifying: {
        always: Machine.transition({
          cases: (branch) => [
            branch({
              title: "even",
              when: ({ containingState }) =>
                containingState.id % 2 === 0 ? Option.some(undefined) : Option.none(),
              target: (to) => to.local.Done(),
              resolve: ({ containingState, target }) => {
                console.log(`ticket ${containingState.id}: verifying`)
                console.log(`ticket ${containingState.id}: done`)
                return target.from()
              }
            })
          ],
          otherwise: {
            target: (to) => to.local.NeedsReview(),
            resolve: ({ containingState, target }) => {
              console.log(`ticket ${containingState.id}: verifying`)
              console.log(`ticket ${containingState.id}: needs review`)
              return target.from()
            }
          }
        })
      },
      Done: {},
      NeedsReview: {}
    }
  }
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
    yield* Machine.start(TicketMachine, new Ticket({ id: Number(input) }))
  }
})

await Effect.runPromise(Effect.scoped(program))
