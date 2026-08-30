import type {
  WorkflowDefinition,
  WorkflowRecord,
  WorkflowRunRecord,
  WorkflowRunState,
  WorkflowRunStepRecord,
  WorkflowRunStepStatus
} from "../domain/types.ts"

export type InsertWorkflowInput = {
  definition: WorkflowDefinition
}

export type ListWorkflowsQuery = {
  showDeleted?: boolean
}

export type InsertWorkflowRunInput = {
  workflowId: string
  cursorAgentId?: string | null
  temporalWorkflowId?: string | null
  currentStepId?: string | null
  state?: WorkflowRunState
}

export type UpdateWorkflowRunInput = {
  cursorAgentId?: string | null
  temporalWorkflowId?: string | null
  currentStepId?: string | null
  state?: WorkflowRunState
}

export type InsertWorkflowRunStepInput = {
  runId: string
  stepId: string
  cursorAgentId?: string | null
  prompt?: string | null
  output?: string | null
  status?: WorkflowRunStepStatus
  startedAt?: string | null
  finishedAt?: string | null
}

export type WorkflowStore = {
  insertWorkflow(input: InsertWorkflowInput): Promise<WorkflowRecord>
  listWorkflows(query?: ListWorkflowsQuery): Promise<WorkflowRecord[]>
  getWorkflow(id: string): Promise<WorkflowRecord | null>
  updateWorkflow(id: string, input: InsertWorkflowInput): Promise<WorkflowRecord | null>
  deleteWorkflow(id: string): Promise<boolean>
  insertRun(input: InsertWorkflowRunInput): Promise<WorkflowRunRecord>
  listRuns(workflowId: string): Promise<WorkflowRunRecord[]>
  getRun(id: string): Promise<WorkflowRunRecord | null>
  updateRun(id: string, patch: UpdateWorkflowRunInput): Promise<WorkflowRunRecord>
  insertRunStep(input: InsertWorkflowRunStepInput): Promise<WorkflowRunStepRecord>
  listRunSteps(runId: string): Promise<WorkflowRunStepRecord[]>
  close(): Promise<void>
}
