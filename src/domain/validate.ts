import type {
  AgentDefinition,
  CloudAgentOptions,
  CloudEnv,
  CloudRepo,
  ConversationMode,
  CursorCloudCreateOptions,
  McpHttpServer,
  McpServerConfig,
  McpStdioServer,
  ModelParameterValue,
  ModelSelection,
  OutputMatch,
  ValidationIssue,
  ValidationResult,
  WorkflowDefinition,
  WorkflowRoute,
  WorkflowStep
} from "./types.ts"

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

const parseMcpServer = (value: unknown, path: string, issues: ValidationIssue[]): McpServerConfig | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  if ("command" in value) {
    expectKeys(value, path, new Set(["type", "command", "args", "env"]), issues)
    if (value.type !== undefined && value.type !== "stdio") {
      push(issues, `${path}.type`, 'stdio servers must use type "stdio" or omit type')
    }
    if ("cwd" in value) {
      push(issues, `${path}.cwd`, "cwd is local-only; cloud stdio servers reject this field")
    }
    const command = requireNonEmptyString(value.command, `${path}.command`, issues)
    let args: string[] | undefined
    if (value.args !== undefined) {
      if (!Array.isArray(value.args) || value.args.some((item) => !isString(item))) {
        push(issues, `${path}.args`, "must be an array of strings")
      } else {
        args = value.args
      }
    }
    let env: Record<string, string> | undefined
    if (value.env !== undefined) env = requireStringRecord(value.env, `${path}.env`, issues)
    if (!command) return undefined
    const server: McpStdioServer = { command }
    if (value.type === "stdio") server.type = "stdio"
    if (args) server.args = args
    if (env) server.env = env
    return server
  }
  expectKeys(value, path, new Set(["type", "url", "headers", "auth"]), issues)
  if (value.type !== undefined && value.type !== "http" && value.type !== "sse") {
    push(issues, `${path}.type`, 'must be "http" or "sse"')
  }
  const url = requireNonEmptyString(value.url, `${path}.url`, issues)
  let headers: Record<string, string> | undefined
  if (value.headers !== undefined) headers = requireStringRecord(value.headers, `${path}.headers`, issues)
  let auth: McpHttpServer["auth"] | undefined
  if (value.auth !== undefined) {
    if (!isRecord(value.auth)) {
      push(issues, `${path}.auth`, "must be an object")
    } else {
      expectKeys(value.auth, `${path}.auth`, new Set(["CLIENT_ID", "CLIENT_SECRET", "scopes"]), issues)
      const CLIENT_ID = requireNonEmptyString(value.auth.CLIENT_ID, `${path}.auth.CLIENT_ID`, issues)
      let CLIENT_SECRET: string | undefined
      if (value.auth.CLIENT_SECRET !== undefined) {
        CLIENT_SECRET = requireNonEmptyString(value.auth.CLIENT_SECRET, `${path}.auth.CLIENT_SECRET`, issues)
      }
      let scopes: string[] | undefined
      if (value.auth.scopes !== undefined) {
        if (!Array.isArray(value.auth.scopes) || value.auth.scopes.some((item) => !isString(item))) {
          push(issues, `${path}.auth.scopes`, "must be an array of strings")
        } else {
          scopes = value.auth.scopes
        }
      }
      if (CLIENT_ID) {
        auth = { CLIENT_ID }
        if (CLIENT_SECRET) auth.CLIENT_SECRET = CLIENT_SECRET
        if (scopes) auth.scopes = scopes
      }
    }
  }
  if (!url) return undefined
  const server: McpHttpServer = { url }
  if (value.type === "http" || value.type === "sse") server.type = value.type
  if (headers) server.headers = headers
  if (auth) server.auth = auth
  return server
}

const parseMcpServers = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): Record<string, McpServerConfig> | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  const servers: Record<string, McpServerConfig> = {}
  for (const [name, raw] of Object.entries(value)) {
    const server = parseMcpServer(raw, `${path}.${name}`, issues)
    if (server) servers[name] = server
  }
  return servers
}

const parseSubagent = (value: unknown, path: string, issues: ValidationIssue[]): AgentDefinition | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["description", "prompt", "model", "mcpServers"]), issues)
  const description = requireNonEmptyString(value.description, `${path}.description`, issues)
  const prompt = requireNonEmptyString(value.prompt, `${path}.prompt`, issues)
  let model: AgentDefinition["model"]
  if (value.model !== undefined) {
    if (value.model === "inherit") model = "inherit"
    else model = parseModelSelection(value.model, `${path}.model`, issues)
  }
  let mcpServers: string[] | undefined
  if (value.mcpServers !== undefined) {
    if (!Array.isArray(value.mcpServers) || value.mcpServers.some((item) => !isString(item))) {
      push(issues, `${path}.mcpServers`, "must be an array of parent MCP server names")
    } else {
      mcpServers = value.mcpServers
    }
  }
  if (!description || !prompt) return undefined
  const agent: AgentDefinition = { description, prompt }
  if (model) agent.model = model
  if (mcpServers) agent.mcpServers = mcpServers
  return agent
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
  expectKeys(value, path, new Set(["name", "model", "mode", "cloud", "mcpServers", "agents"]), issues)
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
  let mcpServers: Record<string, McpServerConfig> | undefined
  if (value.mcpServers !== undefined) mcpServers = parseMcpServers(value.mcpServers, `${path}.mcpServers`, issues)
  let agents: Record<string, AgentDefinition> | undefined
  if (value.agents !== undefined) {
    if (!isRecord(value.agents)) {
      push(issues, `${path}.agents`, "must be an object")
    } else {
      agents = {}
      for (const [agentName, raw] of Object.entries(value.agents)) {
        const parsed = parseSubagent(raw, `${path}.agents.${agentName}`, issues)
        if (parsed) agents[agentName] = parsed
      }
    }
  }
  if (!model || !cloud) return undefined
  const agent: CursorCloudCreateOptions = { model, cloud }
  if (name) agent.name = name
  if (mode) agent.mode = mode
  if (mcpServers) agent.mcpServers = mcpServers
  if (agents) agent.agents = agents
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

const parseRoute = (value: unknown, path: string, issues: ValidationIssue[]): WorkflowRoute | undefined => {
  if (!isRecord(value)) {
    push(issues, path, "must be an object")
    return undefined
  }
  expectKeys(value, path, new Set(["to", "prompt", "match"]), issues)
  const to = requireNonEmptyString(value.to, `${path}.to`, issues)
  const prompt = requireNonEmptyString(value.prompt, `${path}.prompt`, issues)
  const match = parseMatch(value.match, `${path}.match`, issues)
  if (!to || !prompt || !match) return undefined
  return { to, prompt, match }
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
    systemPrompt = requireNonEmptyString(value.systemPrompt, `${path}.systemPrompt`, issues)
  }
  let mode: ConversationMode | undefined
  if (value.mode !== undefined) mode = parseMode(value.mode, `${path}.mode`, issues)
  if (!Array.isArray(value.routes)) {
    push(issues, `${path}.routes`, "must be an array")
    return undefined
  }
  const routes: WorkflowRoute[] = []
  value.routes.forEach((item, index) => {
    const route = parseRoute(item, `${path}.routes[${index}]`, issues)
    if (route) routes.push(route)
  })
  if (!id) return undefined
  const step: WorkflowStep = { id, routes }
  if (systemPrompt) step.systemPrompt = systemPrompt
  if (mode) step.mode = mode
  return step
}

const checkGraph = (definition: WorkflowDefinition, issues: ValidationIssue[]): void => {
  const ids = definition.steps.map((step) => step.id)
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) push(issues, "steps", `duplicate step id "${id}"`)
      seen.add(id)
    }
  }
  if (!unique.has(definition.entry)) {
    push(issues, "entry", `entry step "${definition.entry}" does not exist`)
  }
  definition.steps.forEach((step, index) => {
    step.routes.forEach((route, routeIndex) => {
      if (!unique.has(route.to)) {
        push(issues, `steps[${index}].routes[${routeIndex}].to`, `unknown route target "${route.to}"`)
      }
    })
  })
}

export const validateWorkflowDefinition = (input: unknown): ValidationResult => {
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
    description = requireNonEmptyString(input.description, "description", issues)
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
  if (!name || !entry || !agent || steps.length === 0) {
    return { ok: false, issues }
  }
  const definition: WorkflowDefinition = { name, entry, agent, steps }
  if (description) definition.description = description
  checkGraph(definition, issues)
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, definition }
}
