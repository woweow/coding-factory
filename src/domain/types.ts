/** Registered workflow definition. Runtime handles live on runs, not here. */

export type ModelParameterValue = {
  id: string
  value: string
}

export type ModelSelection = {
  id: string
  params?: ModelParameterValue[]
}

export type CloudRepo = {
  url: string
  startingRef?: string
  prUrl?: string
}

export type CloudEnv =
  | { type: "cloud"; name?: string }
  | { type: "pool"; name?: string }
  | { type: "machine"; name?: string }

export type CloudAgentOptions = {
  env?: CloudEnv
  repos: CloudRepo[]
  workOnCurrentBranch?: boolean
  autoCreatePR?: boolean
  openAsCursorGithubApp?: boolean
  skipReviewerRequest?: boolean
  envVars?: Record<string, string>
  metadata?: Record<string, string>
}

export type McpStdioServer = {
  type?: "stdio"
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpHttpServer = {
  type?: "http" | "sse"
  url: string
  headers?: Record<string, string>
  auth?: {
    CLIENT_ID: string
    CLIENT_SECRET?: string
    scopes?: string[]
  }
}

export type McpServerConfig = McpStdioServer | McpHttpServer

export type AgentDefinition = {
  description: string
  prompt: string
  model?: ModelSelection | "inherit"
  mcpServers?: string[]
}

export type ConversationMode = "agent" | "plan"

/**
 * Persistable Agent.create() options for a Cursor Cloud inner worker.
 * Mirrors @cursor/sdk AgentOptions / CloudAgentOptions (docs 2026-08).
 * apiKey and local are forbidden: the factory always uses cloud.repos.
 */
export type CursorCloudCreateOptions = {
  name?: string
  model: ModelSelection
  mode?: ConversationMode
  cloud: CloudAgentOptions
  mcpServers?: Record<string, McpServerConfig>
  agents?: Record<string, AgentDefinition>
}

export type OutputMatch =
  | { kind: "always" }
  | { kind: "equals"; key: string; value: string }

export type WorkflowRoute = {
  to: string
  prompt: string
  match: OutputMatch
}

export type WorkflowStep = {
  id: string
  systemPrompt?: string
  mode?: ConversationMode
  routes: WorkflowRoute[]
}

export type WorkflowDefinition = {
  name: string
  description?: string
  entry: string
  agent: CursorCloudCreateOptions
  steps: WorkflowStep[]
}

export type WorkflowRecord = {
  id: string
  name: string
  definition: WorkflowDefinition
  createdAt: string
  updatedAt: string
}

export const WORKFLOW_RUN_STATES = [
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled"
] as const

export type WorkflowRunState = (typeof WORKFLOW_RUN_STATES)[number]

export const WORKFLOW_RUN_STEP_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed"
] as const

export type WorkflowRunStepStatus = (typeof WORKFLOW_RUN_STEP_STATUSES)[number]

/**
 * Runtime envelope for a workflow execution (slice 2+).
 * cursorAgentId is the SDK handle (`bc-...`) threaded across steps.
 */
export type WorkflowRunRecord = {
  id: string
  workflowId: string
  cursorAgentId: string | null
  temporalWorkflowId: string | null
  currentStepId: string | null
  state: WorkflowRunState
  createdAt: string
  updatedAt: string
}

export type WorkflowRunStepRecord = {
  id: string
  runId: string
  stepId: string
  cursorAgentId: string | null
  prompt: string | null
  output: string | null
  status: WorkflowRunStepStatus
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult =
  | { ok: true; definition: WorkflowDefinition }
  | { ok: false; issues: ValidationIssue[] }
