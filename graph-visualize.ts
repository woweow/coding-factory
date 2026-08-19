// @ts-nocheck — PoC visualization CLI; renderer types are looser than Machine exports.
/**
 * Compile branchGraph and print text + Mermaid views (no run).
 * Usage: npm run viz
 */
import { Machine } from "@typeonce/effect-machine"
import { branchGraph, compileGraph } from "./graph-node-routes.ts"
import { makeMermaidRenderer } from "./effect-machine/test/machine/visualization/mermaid.ts"
import { makeTextRenderer } from "./effect-machine/test/machine/visualization/text.ts"

const inspection = {
  stateNodes: Machine.stateNodes,
  initialDefinition: Machine.initialDefinition,
  transitionDefinitions: Machine.transitionDefinitions,
  activityDefinitions: Machine.activityDefinitions,
  configuration: Machine.configuration,
  enabled: Machine.enabled
}

const machine = compileGraph(branchGraph)
const text = makeTextRenderer(inspection)(machine)
const mermaid = makeMermaidRenderer(inspection)(machine)

console.log("=== text ===\n")
console.log(text)
console.log("\n=== mermaid (paste at https://mermaid.live) ===\n")
console.log(mermaid)
