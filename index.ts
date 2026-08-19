import { branchGraph, launchGraph } from "./graph-node-routes.ts"
import { promptTerminal } from "./cli.ts"

await launchGraph(branchGraph, "Implement this feature request.", promptTerminal)
