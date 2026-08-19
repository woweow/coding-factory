import { Effect } from "effect"
import { runGraph } from "./graph-node-routes.ts"

await Effect.runPromise(runGraph)
