// @ts-nocheck — minimal hardcoded wait/resume loop for comparison with compileGraph.
/**
 * Smallest readable hardcoded machine with human input:
 *
 *   Locked  --invoke always-->  AwaitingInput  --Resume-->  Locked  (loops)
 *
 * Flat structure (no Job compound) — useful baseline before reading color-picker-hardcoded.ts.
 *
 * Run: npm run turnstile
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Schema } from "effect"
import { launchMachine, type HumanInputRequest } from "./machine-host.ts"

const PROMPT = "Enter passcode:"

class Ctx extends Schema.TaggedClass<Ctx>("Ctx")("Ctx", {
  note: Schema.String,
  humanMessage: Schema.optional(Schema.String)
}) {}

class Resume extends Schema.TaggedClass<Resume>("Resume")("Resume", { text: Schema.String }) {}
class NeedInput extends Schema.TaggedClass<NeedInput>("NeedInput")("NeedInput", {
  message: Schema.String,
  returnNode: Schema.String
}) {}

const Events = Machine.events(Resume)
const Emissions = Machine.emittedEvents(NeedInput)

const States = Machine.states({
  Locked: Ctx,
  AwaitingInput: Ctx
})

export const TurnstileHumanPattern = Machine.make({
  id: "TurnstileWaitDemo",
  states: States.states,
  events: Events,
  emittedEvents: Emissions,
  input: Ctx,
  initial: (to) => to.Locked().resolve(({ input, target }) => target(new Ctx({ note: input.note })))
}).handle({
  Locked: {
    entry: () => {
      console.log("  entering Locked")
      return undefined
    },
    invoke: (from) =>
      from
        .effect("agent", ({ state }) =>
          Effect.sync(() => {
            console.log(`  note: ${state.note}`)
            console.log(`  agent: ${PROMPT}`)
            return PROMPT
          })
        )
        .onDone((to) =>
          to.full.AwaitingInput().resolve(({ output, state, target }) =>
            target(new Ctx({ note: state.note, humanMessage: output }))
          )
        )
  },

  AwaitingInput: {
    entry: (state, enqueue) => {
      console.log("  entering AwaitingInput")
      enqueue.emit(Emissions.NeedInput({ message: state.humanMessage ?? PROMPT, returnNode: "Locked" }))
      return undefined
    },
    on: {
      Resume: (to) =>
        to.full.Locked().resolve(({ event, target }) => {
          console.log(`  resume at Locked with: ${event.text}`)
          return target(new Ctx({ note: event.text }))
        })
    }
  }
})

export const launchTurnstile = (note: string, provideInput: (req: HumanInputRequest) => Promise<string>) =>
  launchMachine(TurnstileHumanPattern, new Ctx({ note }), provideInput, (text) => Events.Resume({ text }))
