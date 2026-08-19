import { Effect } from "effect"
import { runGraphExamples } from "./graph-nodes.ts"

const program = Effect.gen(function* () {
  yield* runGraphExamples
})

await Effect.runPromise(program)
