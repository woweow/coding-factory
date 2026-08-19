import { Effect } from "effect"
import { runGraphExamples } from "./graph-nodes.ts"
import { runPipelineExamples } from "./graph-pipeline.ts"
import { runTransitionExamples } from "./graph-transitions.ts"

const program = Effect.gen(function*() {
  yield* runPipelineExamples
  yield* runGraphExamples
  yield* runTransitionExamples
})

await Effect.runPromise(program)
