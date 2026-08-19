import { colorGraph, launchGraph } from "./graph-node-routes.ts"
import { promptTerminal } from "./cli.ts"

await launchGraph(colorGraph, "begin", promptTerminal)
