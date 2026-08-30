import type {
  WorkflowDefinition,
  WorkflowRecord,
  WorkflowRunRecord,
  WorkflowRunState,
  WorkflowRunStepRecord,
  WorkflowRunStepStatus
} from "../domain/types.ts"
import { WORKFLOW_RUN_STATES, WORKFLOW_RUN_STEP_STATUSES } from "../domain/types.ts"

export type WorkflowRow = {
  id: string
  name: string
  definition: string | WorkflowDefinition
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RunRow = {
  id: string
  workflow_id: string
  cursor_agent_id: string | null
  temporal_workflow_id: string | null
  current_step_id: string | null
  state: string
  created_at: string
  updated_at: string
}

export type RunStepRow = {
  id: string
  run_id: string
  step_id: string
  cursor_agent_id: string | null
  prompt: string | null
  output: string | null
  status: string
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export const nowIso = (): string => new Date().toISOString()

export const isRunState = (value: string): value is WorkflowRunState =>
  (WORKFLOW_RUN_STATES as readonly string[]).includes(value)

export const isRunStepStatus = (value: string): value is WorkflowRunStepStatus =>
  (WORKFLOW_RUN_STEP_STATUSES as readonly string[]).includes(value)

const asDefinition = (value: string | WorkflowDefinition): WorkflowDefinition => {
  if (typeof value === "string") return JSON.parse(value) as WorkflowDefinition
  return value
}

export const mapWorkflow = (row: WorkflowRow): WorkflowRecord => ({
  id: row.id,
  name: row.name,
  definition: asDefinition(row.definition),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at ?? null
})

export const mapRun = (row: RunRow): WorkflowRunRecord => {
  if (!isRunState(row.state)) {
    throw new Error(`invalid workflow run state "${row.state}"`)
  }
  return {
    id: row.id,
    workflowId: row.workflow_id,
    cursorAgentId: row.cursor_agent_id,
    temporalWorkflowId: row.temporal_workflow_id,
    currentStepId: row.current_step_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const mapRunStep = (row: RunStepRow): WorkflowRunStepRecord => {
  if (!isRunStepStatus(row.status)) {
    throw new Error(`invalid workflow run step status "${row.status}"`)
  }
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    cursorAgentId: row.cursor_agent_id,
    prompt: row.prompt,
    output: row.output,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at
  }
}
