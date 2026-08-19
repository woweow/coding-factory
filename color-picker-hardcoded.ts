// @ts-nocheck — readable hand-written machine; mirrors what compileGraph emits for a pause route.
/**
 * Hardcoded color picker — compare side-by-side with graph-node-routes.ts compileGraph().
 *
 * User-visible graph (what you'd draw on a whiteboard):
 *
 *   askColor  --pause/HUMAN-->  (wait for input)  --Resume-->  askColor
 *   askColor  --CONTINUE-->     logColor [terminal]
 *
 * Compiled shape (what effect-machine actually runs):
 *
 *   Job [compound]
 *   ├─ askColor        invoke agent → human branch → __awaitingInput
 *   │                  invoke agent → continue branch → logColor
 *   ├─ logColor        [final]
 *   └─ __awaitingInput entry emits NeedInput; Resume → returnNode with user text
 *
 * Run: npm run color-demo
 */
import { Machine } from "@typeonce/effect-machine"
import { Effect, Schema } from "effect"
import { launchMachine, type HumanInputRequest } from "./machine-host.ts"

const HUMAN_MESSAGE = "What is your favorite color?"
const AWAITING = "__awaitingInput"
const LAUNCH_EDGE_PROMPT = "begin"

/** Shared workflow context — same fields compileGraph puts on Job schema. */
class Job extends Schema.TaggedClass<Job>("Job")("Job", {
  edgePrompt: Schema.String,
  returnNode: Schema.optional(Schema.String),
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
  Job: {
    schema: Job,
    initial: "askColor",
    states: {
      askColor: {},
      logColor: { type: "final" as const },
      [AWAITING]: {}
    }
  }
})

/** Mock agent: first visit pauses; after Resume, forwards to logColor with user's color as edgePrompt. */
const askColorAgent = (edgePrompt: string) =>
  Effect.sync(() => {
    console.log(`  system prompt: Ask the user for their favorite color. ... edge prompt: ${edgePrompt}`)
    if (edgePrompt === LAUNCH_EDGE_PROMPT) {
      console.log(`  agent response: ${HUMAN_MESSAGE}`)
      return { tag: "human" as const, message: HUMAN_MESSAGE }
    }
    return { tag: "route" as const, value: "CONTINUE" as const }
  })

export const ColorPickerHardcoded = Machine.make({
  id: "ColorPickerHardcoded",
  states: States.states,
  events: Events,
  emittedEvents: Emissions,
  input: Job,
  initial: (to) =>
    to.Job.initial.resolve(({ input, target }) =>
      target.from({ edgePrompt: input.edgePrompt }, (job) => job.askColor.from())
    )
}).handle({
  Job: {
    states: {
      // ── askColor: agent node with pause + continue routes ─────────────────
      askColor: {
        entry: () => {
          console.log("  entering askColor")
          return undefined
        },
        invoke: (from) =>
          from.effect("askColor-agent", ({ containingState }) => askColorAgent(containingState.edgePrompt)).onDone(
            (to) =>
              to.branches({
                human: { title: "human", target: to.local.with },
                CONTINUE: { title: "CONTINUE", target: to.local.with },
                none: { target: to.none }
              }).resolve(({ output, select, containingState }) => {
                // pause route → __awaitingInput (compileGraph: goToAwaiting + returnNode = node.id)
                if (output.tag === "human") {
                  return select.human.from(
                    {
                      edgePrompt: containingState.edgePrompt,
                      returnNode: "askColor",
                      humanMessage: output.message
                    },
                    (job) => job[AWAITING].from()
                  )
                }
                // continue route → logColor, pass through edgePrompt (user's color)
                if (output.tag === "route" && output.value === "CONTINUE") {
                  return select.CONTINUE.from({ edgePrompt: containingState.edgePrompt }, (job) =>
                    job.logColor.from()
                  )
                }
                return select.none()
              })
          )
      },

      // ── logColor: terminal ────────────────────────────────────────────────
      logColor: {
        entry: ({ containingState }) => {
          console.log("  entering logColor")
          console.log(`  user's color: ${containingState.edgePrompt}`)
          return undefined
        }
      },

      // ── __awaitingInput: compiler-injected wait island (not in user graph) ─
      [AWAITING]: {
        entry: (state, enqueue) => {
          console.log(`  entering ${AWAITING}`)
          const message = state.humanMessage ?? HUMAN_MESSAGE
          enqueue.emit(Emissions.NeedInput({ message, returnNode: state.returnNode ?? "askColor" }))
          return undefined
        },
        on: {
          Resume: (to) =>
            to.local.with.resolve(({ event, state, containingState, target }) => {
              const ctx = state ?? containingState
              const returnNode = ctx.returnNode ?? "askColor"
              console.log(`  resume at ${returnNode} with: ${event.text}`)
              return target.from({ edgePrompt: event.text }, (job) => job[returnNode].from())
            })
        }
      }
    }
  }
})

export const launchColorPicker = (provideInput: (request: HumanInputRequest) => Promise<string>) =>
  launchMachine(
    ColorPickerHardcoded,
    new Job({ edgePrompt: LAUNCH_EDGE_PROMPT }),
    provideInput,
    (text) => Events.Resume({ text })
  )
