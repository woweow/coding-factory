// @ts-nocheck — PoC visualization CLI; renderer types are looser than Machine exports.
/**
 * Compile branchGraph and print text + Mermaid views (no run).
 * Usage: npm run viz
 */
import { Machine } from "@typeonce/effect-machine"
import { branchGraph, compileGraph, type RoutedGraph } from "./graph-node-routes.ts"
import { makeMermaidRenderer as makeStockMermaidRenderer } from "./effect-machine/test/machine/visualization/mermaid.ts"
import { makeTextRenderer } from "./effect-machine/test/machine/visualization/text.ts"
import type {
  InspectionApi,
  StateNode,
  TransitionDefinition
} from "./effect-machine/test/machine/visualization/model.ts"

const inspection = {
  stateNodes: Machine.stateNodes,
  initialDefinition: Machine.initialDefinition,
  transitionDefinitions: Machine.transitionDefinitions,
  activityDefinitions: Machine.activityDefinitions,
  configuration: Machine.configuration,
  enabled: Machine.enabled
}

/** Map `${sourcePath}:${branchKey}` → resolved leaf path from graph route metadata. */
const routeHintsFromGraph = (graph: RoutedGraph): ReadonlyMap<string, string> => {
  const root = "Job"
  const hints = new Map<string, string>()

  for (const node of graph.nodes) {
    if (node.terminal) continue
    const source = `${root}.${node.id}`
    for (const route of node.routes) {
      const key = route.match.kind === "equals" ? route.match.value : route.to
      hints.set(`${source}:${key}`, `${root}.${route.to}`)
    }
  }

  return hints
}

type BranchLike = TransitionDefinition["branches"][number] & {
  readonly selection?: {
    readonly path?: string
    readonly kind: string
    readonly scope: string
  }
}

const branchIdentity = (branch: BranchLike): string | undefined =>
  branch.type === "branch" ? branch.key ?? branch.title : undefined

const isLeafPath = (path: string, nodes: ReadonlyArray<StateNode>): boolean => {
  const node = nodes.find((candidate) => candidate.path === path)
  return node?.type === "atomic" || node?.type === "final" || node?.type === "history"
}

const resolveDiagramTarget = (
  source: string,
  branch: BranchLike,
  nodes: ReadonlyArray<StateNode>,
  routeHints: ReadonlyMap<string, string>
): string | undefined => {
  if (branch.target === undefined) return undefined

  const identity = branchIdentity(branch)
  if (identity !== undefined) {
    const hinted = routeHints.get(`${source}:${identity}`)
    if (hinted !== undefined && nodes.some((node) => node.path === hinted)) {
      return hinted
    }
  }

  if (isLeafPath(branch.target, nodes)) return branch.target

  const selection = branch.selection
  if (selection?.scope === "local" && selection.path !== undefined && identity !== undefined) {
    const sibling = `${selection.path}.${identity}`
    if (nodes.some((node) => node.path === sibling)) return sibling
    const lower = `${selection.path}.${identity.toLowerCase()}`
    if (nodes.some((node) => node.path === lower)) return lower
  }

  return branch.target
}

const triggerLabel = (definition: TransitionDefinition): string => {
  const trigger = definition.trigger.type === "event"
    ? String(definition.trigger.event)
    : definition.trigger.type === "invoke"
    ? `invoke ${definition.trigger.id} ${definition.trigger.outcome}`
    : definition.trigger.type
  return `${trigger}${definition.reenter ? " [reenter]" : ""}${
    definition.acceptance === "declinable" ? " [declinable]" : ""
  }`
}

const branchEdgeLabel = (
  definition: TransitionDefinition,
  branch: BranchLike,
  resolvedTarget: string | undefined,
  declaredTarget: string | undefined
): string => {
  const suffix = branch.type === "branch" ? ` [${branch.title}]` : ""
  const localWith =
    branch.selection?.scope === "local" &&
    declaredTarget !== undefined &&
    resolvedTarget !== undefined &&
    declaredTarget !== resolvedTarget
      ? ` (local.with→${resolvedTarget.slice(resolvedTarget.lastIndexOf(".") + 1)})`
      : ""
  return `${triggerLabel(definition)}${suffix}${localWith}`
}

const makeRouteAwareMermaidRenderer = <MachineValue, Snapshot>(
  baseInspection: InspectionApi<MachineValue, Snapshot>,
  routeHints: ReadonlyMap<string, string>
) => {
  const stock = makeStockMermaidRenderer(baseInspection)

  return (machine: MachineValue, snapshot?: Snapshot): string => {
    const nodes = baseInspection.stateNodes(machine)
    const stockLines = stock(machine, snapshot).split("\n")
    const transitionStart = stockLines.findIndex((line) =>
      /^  state_\d+ --> state_\d+:/.test(line)
    )
    if (transitionStart === -1) return stock(machine, snapshot)

    const ids = new Map(nodes.map((node, index) => [node.path, `state_${index}`] as const))
    const prefix = stockLines.slice(0, transitionStart)
    const edges: Array<string> = []

    for (const definition of baseInspection.transitionDefinitions(machine)) {
      const source = ids.get(definition.source)
      if (source === undefined) continue

      for (const branch of definition.branches) {
        const declared = branch.target
        const resolved = resolveDiagramTarget(
          definition.source,
          branch as BranchLike,
          nodes,
          routeHints
        )
        const target = resolved === undefined ? undefined : ids.get(resolved)
        if (target === undefined) continue

        edges.push(
          `  ${source} --> ${target}: ${branchEdgeLabel(
            definition,
            branch as BranchLike,
            resolved,
            declared
          )}`
        )
      }
    }

    return [...prefix, ...edges].join("\n")
  }
}

const formatRoutes = (g: RoutedGraph): string => {
  const lines = [`Routes for ${g.name}:`, ""]
  for (const node of g.nodes) {
    if (node.terminal) {
      lines.push(`  ${node.id} [terminal]`)
      continue
    }
    for (const route of node.routes) {
      const label = route.match.kind === "equals" ? route.match.value : "always"
      lines.push(`  ${node.id} --[${label}]--> ${route.to}`)
      lines.push(`    edge prompt: ${route.prompt}`)
    }
  }
  return lines.join("\n")
}

const graph = branchGraph
const machine = compileGraph(graph)
const routeHints = routeHintsFromGraph(graph)
const text = makeTextRenderer(inspection)(machine)
const mermaidStock = makeStockMermaidRenderer(inspection)(machine)
const mermaid = makeRouteAwareMermaidRenderer(inspection, routeHints)(machine)

console.log(formatRoutes(graph))
console.log("\n=== text ===\n")
console.log(text)
console.log("\n=== mermaid (stock) ===\n")
console.log(mermaidStock)
console.log("\n=== mermaid (route-aware) ===\n")
console.log(mermaid)
