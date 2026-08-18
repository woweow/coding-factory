import { Machine } from "@typeonce/effect-machine"
import * as readline from 'node:readline/promises';
import { Effect, Schema } from "effect"

const State = Schema.TaggedUnion({
  Idle: {},
  Running: { count: Schema.Number }
})

const States = Machine.states(State.cases)
const CounterEvent = Machine.events(
  Schema.TaggedUnion({
    Start: {},
    Increment: {},
    Stop: {}
  })
)

const CounterDefinition = Machine.make({
  id: "Counter",
  states: States.states,
  events: CounterEvent,
  initial: {
    target: (to) => to.Idle(),
    resolve: ({ target }) => target.from()
  }
})

const Counter = CounterDefinition.handle({
  Idle: {
    on: {
      Start: Machine.transition({
        target: (to) => to.full.Running(),
        resolve: ({ target }) => {
          console.log('Starting machine...')
          return target.from({ count: 0 })
        }
      })
    }
  },
  Running: {
    on: {
      Increment: Machine.transition({
        target: (to) => to.full.Running(),
        resolve: ({ state, target }) => {
          console.log(`incrementin from ${state.count}`)
          return target.from({ count: state.count + 1 })
        }
      }),
      Stop: Machine.transition({
        target: (to) => to.full.Idle(),
        resolve: ({ target }) => {
          console.log('stopping')
          return target.from()
        }
      })
    }
  }
})

const increment = Effect.gen(function* () {
  const ref = yield* Machine.start(Counter)
  yield* ref.send(CounterEvent.Increment())
})


const stop = Effect.gen(function* () {
  const ref = yield* Machine.start(Counter)
  yield* ref.send(CounterEvent.Stop())
})

const start = Effect.gen(function* () {
  const ref = yield* Machine.start(Counter)
  yield* ref.send(CounterEvent.Start())
})

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

while (true) {
  const input = await rl.question('> ');
  // input variable contains the terminal input
  console.log(input)
}
