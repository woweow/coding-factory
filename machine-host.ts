// @ts-nocheck — thin host wrapper around Machine.prepare
/**
 * Minimal host: subscribe to NeedInput emissions, call UI, send Resume.
 */
import { Machine } from "@typeonce/effect-machine"
import { Deferred, Effect, Stream } from "effect"

export type HumanInputRequest = {
  message: string
  returnNode: string
}

export const launchMachine = <Event>(
  machine: Machine.Machine.Any,
  input: unknown,
  provideInput: (request: HumanInputRequest) => Promise<string>,
  resume: (text: string) => Event
): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const prepared = yield* Machine.prepare(machine, input)
      const refSlot = yield* Deferred.make()

      yield* prepared.emissions.pipe(
        Stream.runForEach((need) =>
          Effect.gen(function* () {
            const text = yield* Effect.promise(() =>
              provideInput({ message: need.message, returnNode: need.returnNode })
            )
            const ref = yield* Deferred.await(refSlot)
            yield* ref.send(resume(text))
          })
        ),
        Effect.forkChild({ startImmediately: true })
      )

      const ref = yield* prepared.start
      yield* Deferred.succeed(refSlot, ref)
      yield* ref.join
    })
  )
