import { Effect } from "effect"
import { runGraphExamples } from "./graph-nodes.ts"
import { branchGraph, launchGraph } from "./graph-node-routes.ts"

const program = Effect.gen(function* () {
  yield* runGraphExamples
  console.log("\n=== Routed graph (compiled effect-machine) ===")
  yield* Effect.promise(() => launchGraph(branchGraph, "Implement this feature request."))
})

await Effect.runPromise(program)
