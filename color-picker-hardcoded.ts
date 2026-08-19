// @ts-nocheck — idiomatic effect-machine: emissions + public events (no stdin).
/**
 * Two-node color workflow (hardcoded, library-native):
 *
 *   colorPicker  --50% auto-->  colorLogger  (logs cyan)
 *   colorPicker  --50% wait-->  (rests in colorPicker, emits NeedColor)
 *                 --ColorPicked-->  colorLogger  (logs red, from host)
 *
 * Patterns from effect-machine docs (agent-guide.md):
 *   - Machine.emittedEvents + enqueue.emit  → outward notification
 *   - Machine.prepare + emissions stream    → observe before start
 *   - ref.send(publicEvent)                 → resume waiting state
 *
 * Run: npm run color-demo
 */
import { Machine } from "@typeonce/effect-machine"
import { Deferred, Effect, Schema, Stream } from "effect"

const DEFAULT_COLOR = "cyan"
const HOST_COLOR = "red"
const NEED_COLOR_MESSAGE = "Hey, I need a color"

class ColorLogger extends Schema.TaggedClass<ColorLogger>("ColorLogger")("ColorLogger", {
  color: Schema.String
}) {}

class ColorPicked extends Schema.TaggedClass<ColorPicked>("ColorPicked")("ColorPicked", {
  color: Schema.String
}) {}

class NeedColor extends Schema.TaggedClass<NeedColor>("NeedColor")("NeedColor", {
  message: Schema.String
}) {}

const Events = Machine.events(ColorPicked)
const Emissions = Machine.emittedEvents(NeedColor)

const States = Machine.states({
  colorPicker: {},
  colorLogger: { schema: ColorLogger, type: "final" }
})

const pickRoute = Effect.sync(() => {
  if (Math.random() < 0.5) {
    return { tag: "auto" as const, color: DEFAULT_COLOR }
  }
  return { tag: "needColor" as const }
})

export const ColorPickerMachine = Machine.make({
  id: "ColorPicker",
  states: States.states,
  events: Events,
  emittedEvents: Emissions,
  initial: (to) => to.colorPicker().resolve(({ target }) => target.from())
}).handle({
  colorPicker: {
    entry: () => {
      console.log("  [state] entering colorPicker")
      return undefined
    },
    invoke: (from) =>
      from.effect("pick-color", () => pickRoute).onDone((to) =>
        to.branches({
          auto: { title: "auto", target: to.full.colorLogger() },
          wait: { title: "needColor", target: to.none }
        }).resolve(({ output, select, target }, enqueue) => {
          if (output.tag === "auto") {
            console.log(`  [colorPicker] auto route → ${output.color}`)
            return select.auto(new ColorLogger({ color: output.color }))
          }
          console.log(`  [colorPicker] needColor route → resting, emitting`)
          enqueue.emit(Emissions.NeedColor({ message: NEED_COLOR_MESSAGE }))
          return select.wait()
        })
      ),
    on: {
      ColorPicked: (to) =>
        to.full.colorLogger().resolve(({ event, target }) => {
          console.log(`  [colorPicker] ColorPicked event → ${event.color}`)
          return target(new ColorLogger({ color: event.color }))
        })
    }
  },

  colorLogger: {
    entry: ({ state }) => {
      console.log(`  [colorLogger] logging color: ${state.color}`)
      return undefined
    }
  }
})

/** Host: subscribe to emissions, then send ColorPicked — per Machine.prepare docs. */
export const runColorPicker = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      console.log("--- color picker run ---")
      const prepared = yield* Machine.prepare(ColorPickerMachine)
      const refSlot = yield* Deferred.make()

      yield* prepared.emissions.pipe(
        Stream.runForEach((emission) =>
          Effect.gen(function* () {
            console.log(`  [host] emission received: ${emission.message}`)
            console.log(`  [host] sending ColorPicked(${HOST_COLOR})`)
            const ref = yield* Deferred.await(refSlot)
            yield* ref.send(Events.ColorPicked({ color: HOST_COLOR }))
          })
        ),
        Effect.forkChild({ startImmediately: true })
      )

      const ref = yield* prepared.start
      yield* Deferred.succeed(refSlot, ref)
      yield* ref.join
      console.log("--- done ---\n")
    })
  )
