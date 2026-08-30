import type {
  CloudAgentOptions,
  CloudEnv,
  CloudRepo,
  ConversationMode,
  CursorCloudCreateOptions,
  ModelParameterValue,
  ModelSelection,
  OutputMatch,
  ValidationIssue,
  WorkflowDefinition,
  WorkflowRouteJson,
  WorkflowStep
} from "../domain/types.ts"

export type ParseDocumentResult =
  | { ok: true; document: WorkflowDefinition }
  | { ok: false; issues: ValidationIssue[] }

const FORBIDDEN_KEY_NAMES = new Set(["apiKey", "CURSOR_API_KEY"])
const LOCAL_KEY = "local"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === "string"

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"

const push = (issues: ValidationIssue[], path: string, message: string): void => {
  issues.push({ path, message })
}

const scanForbiddenKeys = (value: unknown, path: string, issues: ValidationIssue[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`, issues))
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`
    if (FORBIDDEN_KEY_NAMES.has(key)) {
      push(issues, childPath, "api keys must come from CURSOR_API_KEY at runtime, never from the workflow body")
    }
    if (key === LOCAL_KEY && (path === "" || path === "agent")) {
      push(issues, childPath, "agent.local is rejected; inner workers must be Cursor Cloud agents")
    }
    if ((key === "mcpServers" || key === "agents") && path === "agent") {
      push(issues, childPath, "mcpServers and subagents are not stored on the workflow agent blob")
    }
    scanForbiddenKeys(child, childPath, issues)
  }
}

const expectKeys = (
  value: Record<string, unknown>,
  path: string,
  allowed: ReadonlySet<string>,
  issues: ValidationIssue[]
): void => {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY_NAMES.has(key)) continue
    if (key === LOCAL_KEY && (path === "" || path === "agent")) continue
    if ((key === "mcpServers" || key === "agents") && path === "agent") continue
    if (!allowed.has(key)) {
      push(issues, `${path}.${key}`, `unknown field "${key}"`)
    }
  }
}

const requireNonEmptyString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined => {
  if (!isString(value) || value.trim() === "") {
    push(issues, path, "must be a non-empty string")
    return undefined
  }
  return value
}

const optionalString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined => {
  if (!isString(value)) {
    push(issues, path, "must be a string")
    return undefined
  }
  return value
}

const requireStringRecord = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object of string values")
    return undefined
  }
  const out: Record<string, string> = {}
  for (const [key, child] of Object.entries(value)) {
    if (!isString(child)) {
      push(issues, `${path}.${key}`, "must be a string")
      continue
    }
    if (key.startsWith("CURSOR_")) {
      push(issues, `${path}.${key}`, "names starting with CURSOR_ are reserved by the Cursor SDK")
      continue
    }
    out[key] = child
  }
  return out
}

const parseModelParams = (value: unknown, path: string, issues: ValidationIssue[]): ModelParameterValue[] | undefined => {
  if (!Array.isArray(value)) {
    push(issues, path, "must be an array")
    return undefined
  }
  const params: ModelParameterValue[] = []
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      push(issues, itemPath, "must be an object")
      return
    }
    expectKeys(item, itemPath, new Set(["id", "value"]), issues)
    const id = requireNonEmptyString(item.id, `${itemPath}.id`, issues)
    const paramValue = requireNonEmptyString(item.value, `${itemPath}.value`, issues)
    if (id && paramValue) params.push({ id, value: paramValue })
  })
  return params
}

const parseModelSelection = (value: unknown, path: string, issues: ValidationIssue[]): ModelSelection | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["id", "params"]), issues)
  const id = requireNonEmptyString(value.id, `${path}.id`, issues)
  let params: ModelParameterValue[] | undefined
  if (value.params !== undefined) params = parseModelParams(value.params, `${path}.params`, issues)
  if (!id) return undefined
  return params ? { id, params } : { id }
}

const parseCloudEnv = (value: unknown, path: string, issues: ValidationIssue[]): CloudEnv | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["type", "name"]), issues)
  const type = value.type
  if (type !== "cloud" && type !== "pool" && type !== "machine") {
    push(issues, `${path}.type`, 'must be "cloud", "pool", or "machine"')
    return undefined
  }
  if (value.name !== undefined && (!isString(value.name) || value.name.trim() === "")) {
    push(issues, `${path}.name`, "must be a non-empty string when set")
    return undefined
  }
  return value.name === undefined ? { type } : { type, name: value.name }
}

const parseRepo = (value: unknown, path: string, issues: ValidationIssue[]): CloudRepo | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["url", "startingRef", "prUrl"]), issues)
  const url = requireNonEmptyString(value.url, `${path}.url`, issues)
  if (url && !/^https?:\/\//.test(url)) {
    push(issues, `${path}.url`, "must be an http(s) repository URL")
  }
  let startingRef: string | undefined
  let prUrl: string | undefined
  if (value.startingRef !== undefined) {
    startingRef = requireNonEmptyString(value.startingRef, `${path}.startingRef`, issues)
  }
  if (value.prUrl !== undefined) {
    prUrl = requireNonEmptyString(value.prUrl, `${path}.prUrl`, issues)
  }
  if (!url) return undefined
  const repo: CloudRepo = { url }
  if (startingRef) repo.startingRef = startingRef
  if (prUrl) repo.prUrl = prUrl
  return repo
}

const parseCloud = (value: unknown, path: string, issues: ValidationIssue[]): CloudAgentOptions | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(
    value,
    path,
    new Set([
      "env",
      "repos",
      "workOnCurrentBranch",
      "autoCreatePR",
      "openAsCursorGithubApp",
      "skipReviewerRequest",
      "envVars",
      "metadata"
    ]),
    issues
  )
  if (!Array.isArray(value.repos)) {
    push(issues, `${path}.repos`, "must be present as an array so the SDK cannot default to local")
    return undefined
  }
  if (value.repos.length < 1) {
    push(issues, `${path}.repos`, "must include at least one repository")
  }
  const repos: CloudRepo[] = []
  value.repos.forEach((item, index) => {
    const repo = parseRepo(item, `${path}.repos[${index}]`, issues)
    if (repo) repos.push(repo)
  })
  let env: CloudEnv | undefined
  if (value.env !== undefined) env = parseCloudEnv(value.env, `${path}.env`, issues)
  if (env?.name && repos.length > 0) {
    push(issues, `${path}.env.name`, "named Cursor-hosted environments are mutually exclusive with repos")
  }
  const optionalBool = (raw: unknown, field: string): boolean | undefined => {
    if (raw === undefined) return undefined
    if (!isBoolean(raw)) {
      push(issues, `${path}.${field}`, "must be a boolean")
      return undefined
    }
    return raw
  }
  const cloud: CloudAgentOptions = { repos }
  if (env) cloud.env = env
  const workOnCurrentBranch = optionalBool(value.workOnCurrentBranch, "workOnCurrentBranch")
  if (workOnCurrentBranch !== undefined) cloud.workOnCurrentBranch = workOnCurrentBranch
  const autoCreatePR = optionalBool(value.autoCreatePR, "autoCreatePR")
  if (autoCreatePR !== undefined) cloud.autoCreatePR = autoCreatePR
  const openAsCursorGithubApp = optionalBool(value.openAsCursorGithubApp, "openAsCursorGithubApp")
  if (openAsCursorGithubApp !== undefined) cloud.openAsCursorGithubApp = openAsCursorGithubApp
  const skipReviewerRequest = optionalBool(value.skipReviewerRequest, "skipReviewerRequest")
  if (skipReviewerRequest !== undefined) cloud.skipReviewerRequest = skipReviewerRequest
  if (value.envVars !== undefined) {
    const envVars = requireStringRecord(value.envVars, `${path}.envVars`, issues)
    if (envVars) cloud.envVars = envVars
  }
  if (value.metadata !== undefined) {
    const metadata = requireStringRecord(value.metadata, `${path}.metadata`, issues)
    if (metadata) cloud.metadata = metadata
  }
  return cloud
}

const parseMode = (value: unknown, path: string, issues: ValidationIssue[]): ConversationMode | undefined => {
  if (value !== "agent" && value !== "plan") {
    push(issues, path, 'must be "agent" or "plan"')
    return undefined
  }
  return value
}

const parseAgent = (value: unknown, path: string, issues: ValidationIssue[]): CursorCloudCreateOptions | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["name", "model", "mode", "cloud"]), issues)
  if ("tools" in value || "disallowedTools" in value) {
    push(issues, path, "tools and disallowedTools are local-only and are not stored")
  }
  if ("agentId" in value) {
    push(issues, `${path}.agentId`, "agentId is minted at run time; do not store it on the workflow")
  }
  if ("idempotencyKey" in value) {
    push(issues, `${path}.idempotencyKey`, "idempotencyKey is per create/send, not part of a workflow definition")
  }
  const model = parseModelSelection(value.model, `${path}.model`, issues)
  const cloud = parseCloud(value.cloud, `${path}.cloud`, issues)
  let name: string | undefined
  if (value.name !== undefined) name = requireNonEmptyString(value.name, `${path}.name`, issues)
  let mode: ConversationMode | undefined
  if (value.mode !== undefined) mode = parseMode(value.mode, `${path}.mode`, issues)
  if (!model || !cloud) return undefined
  const agent: CursorCloudCreateOptions = { model, cloud }
  if (name) agent.name = name
  if (mode) agent.mode = mode
  return agent
}

const parseMatch = (value: unknown, path: string, issues: ValidationIssue[]): OutputMatch | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  if (value.kind === "always") {
    expectKeys(value, path, new Set(["kind"]), issues)
    return { kind: "always" }
  }
  if (value.kind === "equals") {
    expectKeys(value, path, new Set(["kind", "key", "value"]), issues)
    const key = requireNonEmptyString(value.key, `${path}.key`, issues)
    const matchValue = requireNonEmptyString(value.value, `${path}.value`, issues)
    if (!key || !matchValue) return undefined
    return { kind: "equals", key, value: matchValue }
  }
  push(issues, `${path}.kind`, 'must be "always" or "equals"')
  return undefined
}

const parseRoute = (value: unknown, path: string, issues: ValidationIssue[]): WorkflowRouteJson | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["to", "prompt", "match"]), issues)
  const to = requireNonEmptyString(value.to, `${path}.to`, issues)
  let prompt: string | undefined
  if (value.prompt !== undefined) prompt = optionalString(value.prompt, `${path}.prompt`, issues)
  let match: OutputMatch | undefined
  if (value.match !== undefined) match = parseMatch(value.match, `${path}.match`, issues)
  if (!to) return undefined
  if (value.prompt !== undefined && prompt === undefined) return undefined
  if (value.match !== undefined && match === undefined) return undefined
  const route: WorkflowRouteJson = { to }
  if (prompt !== undefined) route.prompt = prompt
  if (match) route.match = match
  return route
}

const parseStep = (value: unknown, path: string, issues: ValidationIssue[]): WorkflowStep | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["id", "systemPrompt", "mode", "routes"]), issues)
  const id = requireNonEmptyString(value.id, `${path}.id`, issues)
  let systemPrompt: string | undefined
  if (value.systemPrompt !== undefined) {
    systemPrompt = optionalString(value.systemPrompt, `${path}.systemPrompt`, issues)
  }
  let mode: ConversationMode | undefined
  if (value.mode !== undefined) mode = parseMode(value.mode, `${path}.mode`, issues)
  let routes: WorkflowRouteJson[] | undefined
  if (value.routes !== undefined) {
    if (!Array.isArray(value.routes)) {
      push(issues, `${path}.routes`, "must be an array")
      return undefined
    }
    routes = []
    value.routes.forEach((item, index) => {
      const route = parseRoute(item, `${path}.routes[${index}]`, issues)
      if (route) routes?.push(route)
    })
  }
  if (!id) return undefined
  const step: WorkflowStep = { id }
  if (systemPrompt !== undefined) step.systemPrompt = systemPrompt
  if (mode) step.mode = mode
  if (routes) step.routes = routes
  return step
}

export const parseWorkflowDocument = (input: unknown): ParseDocumentResult => {
  const issues: ValidationIssue[] = []
  scanForbiddenKeys(input, "", issues)
  if (!isRecord(input)) {
    push(issues, "", "workflow body must be a JSON object")
    return { ok: false, issues }
  }
  expectKeys(input, "", new Set(["name", "description", "entry", "agent", "steps"]), issues)
  const name = requireNonEmptyString(input.name, "name", issues)
  let description: string | undefined
  if (input.description !== undefined) {
    description = optionalString(input.description, "description", issues)
  }
  const entry = requireNonEmptyString(input.entry, "entry", issues)
  const agent = parseAgent(input.agent, "agent", issues)
  if (!Array.isArray(input.steps) || input.steps.length < 1) {
    push(issues, "steps", "must be a non-empty array")
  }
  const steps: WorkflowStep[] = []
  if (Array.isArray(input.steps)) {
    input.steps.forEach((item, index) => {
      const step = parseStep(item, `steps[${index}]`, issues)
      if (step) steps.push(step)
    })
  }
  if (issues.length > 0 || !name || !entry || !agent || steps.length === 0) {
    return { ok: false, issues }
  }
  const document: WorkflowDefinition = { name, entry, agent, steps }
  if (description !== undefined) document.description = description
  return { ok: true, document }
}
