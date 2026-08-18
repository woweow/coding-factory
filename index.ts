import { Machine } from "@typeonce/effect-machine"
import * as readline from 'node:readline/promises';
import { Effect, Schema } from "effect"

const State = Schema.TaggedUnion({
  Idle: { count: Schema.Number },
  Running: { count: Schema.Number }
})

const States = Machine.states(State.cases)
const CounterEvent = Machine.events(
  Schema.TaggedUnion({
    Start: {},
    Status: {},
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
    resolve: ({ target }) => target.from({ count: 0 })
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
      }),
      Status: Machine.transition({
        target: (to) => to.full.Idle(),
        resolve: ({ state, target }) => {
          console.log(`State: ${state.count}`)
          return target.from({ count: state.count })
        }
      })
    },
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
      Status: Machine.transition({
        target: (to) => to.full.Running(),
        resolve: ({ state, target }) => {
          console.log(`State: ${state.count}`)
          return target.from({ count: state.count })
        }
      }),
      Stop: Machine.transition({
        target: (to) => to.full.Idle(),
        resolve: ({ state, target }) => {
          console.log('stopping')
          return target.from({ count: state.count })
        }
      })
    }
  }
})

const program = Effect.gen(function* () {
  const ref = yield* Machine.start(Counter)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  while (true) {
    console.log('awaiting input...')
    const input = yield* Effect.promise(() => rl.question('> '))
    switch (input) {
      case 'exit':
        rl.close()
        return
      case 'inc':
        yield* ref.send(CounterEvent.Increment())
        break
      case 'stop':
        yield* ref.send(CounterEvent.Stop())
        break
      case 'start':
        yield* ref.send(CounterEvent.Start())
        console.log('started')
        break
      case 'status':
        yield* ref.send(CounterEvent.Status())
        break
      default:
        console.log('invalid arg')
        break
    }
  }
})

await Effect.runPromise(Effect.scoped(program))
