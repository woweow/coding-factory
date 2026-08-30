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

export type ConversationMode = "agent" | "plan"

/**
 * Persistable Agent.create() options for a Cursor Cloud inner worker.
 * apiKey, local, mcpServers, and subagents are not stored.
 * Runtime handle (bc-...) lives on the run, not here.
 */
export type CursorCloudCreateOptions = {
  name?: string
  model: ModelSelection
  mode?: ConversationMode
  cloud: CloudAgentOptions
}

export type OutputMatch =
  | { kind: "always" }
  | { kind: "equals"; key: string; value: string }

export type WorkflowRoute = {
  to: string
  prompt?: string
  match?: OutputMatch
}

export type WorkflowStep = {
  id: string
  systemPrompt?: string
  mode?: ConversationMode
  routes?: WorkflowRoute[]
}

/** User-submitted workflow JSON. Execute-time defaults are not stored here. */
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
  deletedAt: string | null
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
