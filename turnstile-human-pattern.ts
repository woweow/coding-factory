// @ts-nocheck — hand-written reference machine; types intentionally relaxed.
/**
 * Hand-written machine showing where __awaitingInput lives.
 *
 * Same shape as compileGraph() output in graph-node-routes.ts, but written
 * explicitly like the turnstile docs example so you can read the structure.
 *
 * Flow (turnstile + human pause):
 *   locked --CoinInserted--> unlocked --GatePushed--> locked
 *   locked --invoke picks HUMAN--> __awaitingInput --Resume--> locked
 *
 * Not wired to CLI — reference only.
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Option, Schema } from "effect"

const HUMAN_MESSAGE = "What is your favorite color?"

class GateJob extends Schema.TaggedClass<GateJob>("GateJob")("GateJob", {
  edgePrompt: Schema.String,
  returnNode: Schema.optional(Schema.String),
  humanMessage: Schema.optional(Schema.String)
}) {}

class Resume extends Schema.TaggedClass<Resume>("Resume")("Resume", {
  text: Schema.String
}) {}

class NeedInput extends Schema.TaggedClass<NeedInput>("NeedInput")("NeedInput", {
  message: Schema.String,
  returnNode: Schema.String
}) {}

class CoinInserted extends Schema.TaggedClass<CoinInserted>("CoinInserted")("CoinInserted", {}) {}
class GatePushed extends Schema.TaggedClass<GatePushed>("GatePushed")("GatePushed", {}) {}

const Events = Machine.events(Resume, CoinInserted, GatePushed)
const Emissions = Machine.emittedEvents(NeedInput)

const States = Machine.states({
  Job: {
    schema: GateJob,
    initial: "locked",
    states: {
      locked: {},
      unlocked: {},
      complete: { type: "final" },
      // ▼ Compiler injects this child — not in your routedGraph JSON
      __awaitingInput: {}
    }
  }
})

type JobChild = Record<string, { from: () => unknown }>
type Target = {
  from: (input: { edgePrompt: string; returnNode?: string; humanMessage?: string }, pick: (job: JobChild) => unknown) => unknown
}

const goTo = (target: Target, edgePrompt: string, next: string) =>
  target.from({ edgePrompt }, (job) => job[next].from())

const goToAwaiting = (target: Target, edgePrompt: string, returnNode: string, message: string) =>
  target.from({ edgePrompt, returnNode, humanMessage: message }, (job) => job.__awaitingInput.from())

export const TurnstileHumanPattern = Machine.make({
  id: "TurnstileHumanPattern",
  states: States.states,
  events: Events,
  emittedEvents: Emissions,
  input: GateJob,
  initial: {
    target: (to) => to.Job.initial(),
    resolve: ({ input, target }) => goTo(target as Target, input.edgePrompt, "locked")
  }
}).handle({
  Job: {
    states: {
      locked: {
        entry: () => {
          console.log("  entering locked")
          return undefined
        },
        invoke: Machine.invoke({
          id: "locked-agent",
          effect: ({ containingState }) =>
            Effect.sync(() => {
              console.log(`  edge prompt: ${containingState.edgePrompt}`)
              return Math.random() < 0.5
                ? ({ tag: "route" as const, value: "CONTINUE" as const })
                : ({ tag: "human" as const, message: HUMAN_MESSAGE })
            }),
          onDone: Machine.transition({
            cases: (branch) => [
              // Pause route: no destination — compiler sends you to __awaitingInput
              branch({
                title: "human",
                when: ({ output }) => (output.tag === "human" ? Option.some("__awaitingInput") : Option.none()),
                target: (to) => to.local.with(),
                resolve: ({ output, containingState, target }) =>
                  goToAwaiting(target as Target, containingState.edgePrompt, "locked", output.message)
              }),
              branch({
                title: "CONTINUE",
                when: ({ output }) =>
                  output.tag === "route" && output.value === "CONTINUE" ? Option.some("unlocked") : Option.none(),
                target: (to) => to.local.with(),
                resolve: ({ target }) => goTo(target as Target, "Gate is unlocked.", "unlocked")
              })
            ],
            otherwise: { target: (to) => to.none(), resolve: () => undefined }
          })
        }),
        on: {
          // Docs turnstile: explicit coin event (same as CoinInserted in turnstile/machine.ts)
          CoinInserted: Machine.transition({
            target: (to) => to.local.with(),
            resolve: ({ target }) => goTo(target as Target, "Gate is unlocked.", "unlocked")
          })
        }
      },

      unlocked: {
        on: {
          GatePushed: Machine.transition({
            target: (to) => to.local.with(),
            resolve: ({ target }) => goTo(target as Target, "Gate re-locked.", "locked")
          })
        }
      },

      complete: {},

      // ─── __awaitingInput: human-in-the-loop island ───────────────────────
      // Entered when invoke onDone picks the pause/human branch above.
      // No agent invoke here — emit NeedInput, then wait for Resume event.
      __awaitingInput: {
        entry: (state, enqueue) => {
          console.log("  entering __awaitingInput")
          const message = state.humanMessage ?? HUMAN_MESSAGE
          enqueue.emit(Emissions.NeedInput({ message, returnNode: state.returnNode ?? "locked" }))
          return undefined
        },
        on: {
          // UI collected text → host sends Resume → return to returnNode
          Resume: Machine.transition({
            target: (to) => to.local.with(),
            resolve: ({ event, state, containingState, target }) => {
              const ctx = state ?? containingState
              const returnNode = ctx.returnNode ?? "locked"
              console.log(`  resume at ${returnNode} with: ${event.text}`)
              return goTo(target as Target, event.text, returnNode)
            }
          })
        }
      }
    }
  }
})
