import type {
  CloudAgentOptions,
  CloudRepo,
  CursorCloudCreateOptions,
  ModelParameterValue,
  ModelSelection,
  RuntimeCloudAgentOptions,
  RuntimeCursorCloudCreateOptions,
  ValidationIssue,
  ValidationResult,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowNode,
  WorkflowRoute,
  WorkflowRouteJson,
  WorkflowStep
} from "../domain/types.ts"
import { fillDefault, omitIfDefault, valuesEqual, WORKFLOW_DEFAULTS } from "./defaults.ts"
import { parseWorkflowDocument } from "./parse.ts"

export type JsonToNodeResult =
  | { ok: true; node: WorkflowGraph }
  | { ok: false; issues: ValidationIssue[] }

const assignDefined = <T extends object>(entries: Array<readonly [string, unknown]>): T => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

const sortStringMap = (
  value: Record<string, string> | undefined,
  spec: { value: Record<string, string> }
): Record<string, string> | undefined => {
  const present = omitIfDefault(value, spec)
  if (!present) return undefined
  const keys = Object.keys(present).sort()
  const out: Record<string, string> = {}
  for (const key of keys) {
    const mapped = present[key]
    if (mapped !== undefined) out[key] = mapped
  }
  return out
}

const checkGraph = (graph: WorkflowGraph, issues: ValidationIssue[]): void => {
  const ids = graph.nodes.map((node) => node.id)
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) issues.push({ path: "steps", message: `duplicate step id "${id}"` })
      seen.add(id)
    }
  }
  if (!unique.has(graph.entry)) {
    issues.push({ path: "entry", message: `entry step "${graph.entry}" does not exist` })
  }
  graph.nodes.forEach((node, index) => {
    node.routes.forEach((route, routeIndex) => {
      if (!unique.has(route.to)) {
        issues.push({
          path: `steps[${index}].routes[${routeIndex}].to`,
          message: `unknown route target "${route.to}"`
        })
      }
    })
  })
}

const toRuntimeRepos = (repos: CloudRepo[]): CloudRepo[] =>
  repos.map((repo) =>
    assignDefined<CloudRepo>([
      ["url", repo.url],
      ["startingRef", repo.startingRef],
      ["prUrl", repo.prUrl]
    ])
  )

const toRuntimeModel = (model: ModelSelection): ModelSelection => {
  const params = omitIfDefault(model.params, WORKFLOW_DEFAULTS.modelParams)
  return params ? { id: model.id, params } : { id: model.id }
}

const toRuntimeAgent = (agent: CursorCloudCreateOptions): RuntimeCursorCloudCreateOptions => {
  const envVars = omitIfDefault(agent.cloud.envVars, WORKFLOW_DEFAULTS.envVars)
  const metadata = omitIfDefault(agent.cloud.metadata, WORKFLOW_DEFAULTS.metadata)
  const cloud: RuntimeCloudAgentOptions = {
    env: fillDefault(agent.cloud.env, WORKFLOW_DEFAULTS.cloudEnv),
    repos: toRuntimeRepos(agent.cloud.repos),
    workOnCurrentBranch: fillDefault(agent.cloud.workOnCurrentBranch, WORKFLOW_DEFAULTS.workOnCurrentBranch),
    autoCreatePR: fillDefault(agent.cloud.autoCreatePR, WORKFLOW_DEFAULTS.autoCreatePR),
    skipReviewerRequest: fillDefault(agent.cloud.skipReviewerRequest, WORKFLOW_DEFAULTS.skipReviewerRequest)
  }
  if (agent.cloud.openAsCursorGithubApp !== undefined) {
    cloud.openAsCursorGithubApp = agent.cloud.openAsCursorGithubApp
  }
  if (envVars) cloud.envVars = envVars
  if (metadata) cloud.metadata = metadata
  const runtime: RuntimeCursorCloudCreateOptions = {
    model: toRuntimeModel(agent.model),
    mode: fillDefault(agent.mode, WORKFLOW_DEFAULTS.agentMode),
    cloud
  }
  if (agent.name) runtime.name = agent.name
  return runtime
}

const toRuntimeRoute = (route: WorkflowRouteJson): WorkflowRoute => ({
  to: route.to,
  prompt: fillDefault(route.prompt, WORKFLOW_DEFAULTS.routePrompt),
  match: fillDefault(route.match, WORKFLOW_DEFAULTS.routeMatch)
})

const toRuntimeNode = (step: WorkflowStep): WorkflowNode => {
  const routes = step.routes === undefined ? Array.from(WORKFLOW_DEFAULTS.nodeRoutes.value) : step.routes
  return {
    id: step.id,
    systemPrompt: fillDefault(step.systemPrompt, WORKFLOW_DEFAULTS.nodeSystemPrompt),
    mode: fillDefault(step.mode, WORKFLOW_DEFAULTS.nodeMode),
    routes: routes.map(toRuntimeRoute)
  }
}

const encodeMatch = (match: WorkflowRoute["match"]): WorkflowRouteJson["match"] =>
  omitIfDefault(match, WORKFLOW_DEFAULTS.routeMatch)

const encodeRoute = (route: WorkflowRoute): WorkflowRouteJson =>
  assignDefined<WorkflowRouteJson>([
    ["to", route.to],
    ["prompt", omitIfDefault(route.prompt, WORKFLOW_DEFAULTS.routePrompt)],
    ["match", encodeMatch(route.match)]
  ])

const encodeStep = (node: WorkflowNode): WorkflowStep => {
  const routes = node.routes.map(encodeRoute)
  return assignDefined<WorkflowStep>([
    ["id", node.id],
    ["systemPrompt", omitIfDefault(node.systemPrompt, WORKFLOW_DEFAULTS.nodeSystemPrompt)],
    ["mode", omitIfDefault(node.mode, WORKFLOW_DEFAULTS.nodeMode)],
    ["routes", omitIfDefault(routes, WORKFLOW_DEFAULTS.nodeRoutes)]
  ])
}

const encodeModel = (model: ModelSelection): ModelSelection => {
  const params = omitIfDefault(model.params, WORKFLOW_DEFAULTS.modelParams)
  return assignDefined<ModelSelection>([
    ["id", model.id],
    ["params", params]
  ])
}

const encodeCloud = (cloud: RuntimeCloudAgentOptions): CloudAgentOptions =>
  assignDefined<CloudAgentOptions>([
    ["env", omitIfDefault(cloud.env, WORKFLOW_DEFAULTS.cloudEnv)],
    ["repos", toRuntimeRepos(cloud.repos)],
    ["workOnCurrentBranch", omitIfDefault(cloud.workOnCurrentBranch, WORKFLOW_DEFAULTS.workOnCurrentBranch)],
    ["autoCreatePR", omitIfDefault(cloud.autoCreatePR, WORKFLOW_DEFAULTS.autoCreatePR)],
    ["openAsCursorGithubApp", cloud.openAsCursorGithubApp],
    ["skipReviewerRequest", omitIfDefault(cloud.skipReviewerRequest, WORKFLOW_DEFAULTS.skipReviewerRequest)],
    ["envVars", sortStringMap(cloud.envVars, WORKFLOW_DEFAULTS.envVars)],
    ["metadata", sortStringMap(cloud.metadata, WORKFLOW_DEFAULTS.metadata)]
  ])

const encodeAgent = (agent: RuntimeCursorCloudCreateOptions): CursorCloudCreateOptions =>
  assignDefined<CursorCloudCreateOptions>([
    ["name", agent.name],
    ["model", encodeModel(agent.model)],
    ["mode", omitIfDefault(agent.mode, WORKFLOW_DEFAULTS.agentMode)],
    ["cloud", encodeCloud(agent.cloud)]
  ])

export const jsonToNode = (input: unknown): JsonToNodeResult => {
  const parsed = parseWorkflowDocument(input)
  if (!parsed.ok) return parsed
  const node: WorkflowGraph = {
    name: parsed.document.name,
    description: fillDefault(parsed.document.description, WORKFLOW_DEFAULTS.description),
    entry: parsed.document.entry,
    agent: toRuntimeAgent(parsed.document.agent),
    nodes: parsed.document.steps.map(toRuntimeNode)
  }
  const issues: ValidationIssue[] = []
  checkGraph(node, issues)
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, node }
}

export const nodeToJson = (node: WorkflowGraph): WorkflowDefinition =>
  assignDefined<WorkflowDefinition>([
    ["name", node.name],
    ["description", omitIfDefault(node.description, WORKFLOW_DEFAULTS.description)],
    ["entry", node.entry],
    ["agent", encodeAgent(node.agent)],
    ["steps", node.nodes.map(encodeStep)]
  ])

export const jsonToNodeOrThrow = (input: unknown): WorkflowGraph => {
  const result = jsonToNode(input)
  if (!result.ok) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")
    throw new Error(`workflow document is invalid: ${details}`)
  }
  return result.node
}

export const canonicalizeWorkflowJson = (input: unknown): ValidationResult => {
  const result = jsonToNode(input)
  if (!result.ok) return result
  return { ok: true, definition: nodeToJson(result.node) }
}

export const graphsEqual = (left: WorkflowGraph, right: WorkflowGraph): boolean => valuesEqual(left, right)
