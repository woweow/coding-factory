import type {
  WorkflowDefinition,
  WorkflowRecord,
  WorkflowRunRecord,
  WorkflowRunStepRecord
} from "../domain/types.ts"
import { DEFAULT_RUN_PROMPT, factoryTemporalId } from "../temporal/activities.ts"
import type { WorkflowStore } from "../storage/port.ts"
import { parseWorkflowDefinition } from "./definition.ts"
import { FactoryError } from "./errors.ts"

export type StartRunFn = (input: {
  runId: string
  temporalWorkflowId: string
  definition: WorkflowDefinition
  prompt: string
}) => Promise<void>

export type ShowDeletedQuery = {
  showDeleted?: boolean
}

export type WorkflowRunView = WorkflowRunRecord & {
  steps: WorkflowRunStepRecord[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireDefinitionBody = (body: unknown): Record<string, unknown> => {
  if (!isRecord(body) || Object.keys(body).length === 0) {
    throw new FactoryError("invalid_json", "request body is required")
  }
  return body
}

const persistSubmittedDefinition = (body: unknown): WorkflowDefinition => {
  const submitted = requireDefinitionBody(body)
  const result = parseWorkflowDefinition(submitted)
  if (!result.ok) {
    throw new FactoryError("validation_error", "workflow definition is invalid", result.issues)
  }
  return submitted as WorkflowDefinition
}

export const parseRunBody = (parsed: unknown): { prompt: string; workflowId?: string } => {
  if (!isRecord(parsed)) {
    throw new FactoryError("invalid_json", "run body must be a JSON object")
  }
  if ("apiKey" in parsed || "CURSOR_API_KEY" in parsed) {
    throw new FactoryError("validation_error", "api keys must come from CURSOR_API_KEY at runtime")
  }
  if ("local" in parsed) {
    throw new FactoryError("validation_error", "agent.local is rejected on run requests")
  }
  for (const key of Object.keys(parsed)) {
    if (key !== "prompt" && key !== "workflowId") {
      throw new FactoryError("validation_error", `unknown field "${key}"`)
    }
  }
  if (parsed.prompt === undefined) {
    return parseOptionalWorkflowId(parsed, DEFAULT_RUN_PROMPT)
  }
  if (typeof parsed.prompt !== "string" || parsed.prompt.trim() === "") {
    throw new FactoryError("validation_error", "prompt must be a non-empty string when set")
  }
  return parseOptionalWorkflowId(parsed, parsed.prompt)
}

const parseOptionalWorkflowId = (
  parsed: Record<string, unknown>,
  prompt: string
): { prompt: string; workflowId?: string } => {
  if (parsed.workflowId === undefined) return { prompt }
  if (typeof parsed.workflowId !== "string" || parsed.workflowId.trim() === "") {
    throw new FactoryError("validation_error", "workflowId is required")
  }
  return { prompt, workflowId: parsed.workflowId }
}

const loadVisibleWorkflow = async (
  store: WorkflowStore,
  id: string,
  showDeleted: boolean
): Promise<WorkflowRecord> => {
  const record = await store.getWorkflow(id)
  if (!record || (record.deletedAt && !showDeleted)) {
    throw new FactoryError("not_found", `workflow ${id} not found`)
  }
  return record
}

export const createFactoryService = (store: WorkflowStore, startRun?: StartRunFn) => {
  const listWorkflows = async (query: ShowDeletedQuery = {}): Promise<WorkflowRecord[]> =>
    store.listWorkflows({ showDeleted: query.showDeleted === true })

  const getWorkflow = async (id: string, query: ShowDeletedQuery = {}): Promise<WorkflowRecord> =>
    loadVisibleWorkflow(store, id, query.showDeleted === true)

  const createWorkflow = async (body: unknown): Promise<WorkflowRecord> => {
    const definition = persistSubmittedDefinition(body)
    return store.insertWorkflow({ definition })
  }

  const updateWorkflow = async (id: string, body: unknown): Promise<WorkflowRecord> => {
    const definition = persistSubmittedDefinition(body)
    const updated = await store.updateWorkflow(id, { definition })
    if (!updated) throw new FactoryError("not_found", `workflow ${id} not found`)
    return updated
  }

  const deleteWorkflow = async (id: string): Promise<void> => {
    const found = await store.deleteWorkflow(id)
    if (!found) throw new FactoryError("not_found", `workflow ${id} not found`)
  }

  const listRuns = async (workflowId: string, query: ShowDeletedQuery = {}): Promise<WorkflowRunRecord[]> => {
    await loadVisibleWorkflow(store, workflowId, query.showDeleted === true)
    return store.listRuns(workflowId)
  }

  const startWorkflowRun = async (workflowId: string, body: unknown = {}): Promise<WorkflowRunView> => {
    if (!startRun) {
      throw new FactoryError("unavailable", "run starter is not configured")
    }
    const { prompt } = parseRunBody(body)
    const workflow = await loadVisibleWorkflow(store, workflowId, false)
    const run = await store.insertRun({
      workflowId,
      currentStepId: workflow.definition.entry,
      state: "pending"
    })
    const temporalWorkflowId = factoryTemporalId(run.id)
    await store.updateRun(run.id, { temporalWorkflowId, state: "running" })
    try {
      await startRun({
        runId: run.id,
        temporalWorkflowId,
        definition: workflow.definition,
        prompt
      })
    } catch (error) {
      await store.updateRun(run.id, { state: "failed" })
      const message = error instanceof Error ? error.message : "failed to start Temporal workflow"
      throw new FactoryError("unavailable", message)
    }
    const started = await store.getRun(run.id)
    if (!started) {
      throw new FactoryError("internal_error", "run vanished after start")
    }
    return { ...started, steps: [] }
  }

  const startWorkflowRunFromBody = async (body: unknown): Promise<WorkflowRunView> => {
    const parsed = parseRunBody(body)
    if (!parsed.workflowId) {
      throw new FactoryError("validation_error", "workflowId is required")
    }
    return startWorkflowRun(parsed.workflowId, body)
  }

  const getRun = async (id: string): Promise<WorkflowRunView> => {
    const record = await store.getRun(id)
    if (!record) throw new FactoryError("not_found", `run ${id} not found`)
    const steps = await store.listRunSteps(id)
    return { ...record, steps }
  }

  return {
    listWorkflows,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    listRuns,
    startWorkflowRun,
    startWorkflowRunFromBody,
    getRun
  }
}

export type FactoryService = ReturnType<typeof createFactoryService>
