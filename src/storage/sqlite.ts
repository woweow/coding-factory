import { mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import type {
  WorkflowDefinition,
  WorkflowRecord,
  WorkflowRunRecord,
  WorkflowRunState,
  WorkflowRunStepRecord,
  WorkflowRunStepStatus
} from "../domain/types.ts"
import { WORKFLOW_RUN_STATES, WORKFLOW_RUN_STEP_STATUSES } from "../domain/types.ts"
import { newWorkflowId, newWorkflowRunId, newWorkflowRunStepId } from "../ids.ts"
import type {
  InsertWorkflowInput,
  InsertWorkflowRunInput,
  InsertWorkflowRunStepInput,
  UpdateWorkflowRunInput,
  WorkflowStore
} from "./port.ts"

const SCHEMA_SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8")

type WorkflowRow = {
  id: string
  name: string
  definition: string
  created_at: string
  updated_at: string
}

type RunRow = {
  id: string
  workflow_id: string
  cursor_agent_id: string | null
  temporal_workflow_id: string | null
  current_step_id: string | null
  state: string
  created_at: string
  updated_at: string
}

type RunStepRow = {
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

const nowIso = (): string => new Date().toISOString()

const isRunState = (value: string): value is WorkflowRunState =>
  (WORKFLOW_RUN_STATES as readonly string[]).includes(value)

const isRunStepStatus = (value: string): value is WorkflowRunStepStatus =>
  (WORKFLOW_RUN_STEP_STATUSES as readonly string[]).includes(value)

const mapWorkflow = (row: WorkflowRow): WorkflowRecord => ({
  id: row.id,
  name: row.name,
  definition: JSON.parse(row.definition) as WorkflowDefinition,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const mapRun = (row: RunRow): WorkflowRunRecord => {
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

const mapRunStep = (row: RunStepRow): WorkflowRunStepRecord => {
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

const ensureParentDir = (sqlitePath: string): void => {
  if (sqlitePath === ":memory:") return
  mkdirSync(dirname(sqlitePath), { recursive: true })
}

export const createSqliteWorkflowStore = (sqlitePath: string): WorkflowStore => {
  ensureParentDir(sqlitePath)
  const db = new DatabaseSync(sqlitePath)
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(SCHEMA_SQL)

  const insertWorkflowStmt = db.prepare(
    `INSERT INTO workflows (id, name, definition, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
  const getWorkflowStmt = db.prepare(`SELECT id, name, definition, created_at, updated_at FROM workflows WHERE id = ?`)
  const insertRunStmt = db.prepare(
    `INSERT INTO workflow_runs (
       id, workflow_id, cursor_agent_id, temporal_workflow_id, current_step_id, state, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const getRunStmt = db.prepare(
    `SELECT id, workflow_id, cursor_agent_id, temporal_workflow_id, current_step_id, state, created_at, updated_at
     FROM workflow_runs WHERE id = ?`
  )
  const updateRunStmt = db.prepare(
    `UPDATE workflow_runs
     SET cursor_agent_id = ?, temporal_workflow_id = ?, current_step_id = ?, state = ?, updated_at = ?
     WHERE id = ?`
  )
  const insertRunStepStmt = db.prepare(
    `INSERT INTO workflow_run_steps (
       id, run_id, step_id, cursor_agent_id, prompt, output, status, started_at, finished_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const listRunStepsStmt = db.prepare(
    `SELECT id, run_id, step_id, cursor_agent_id, prompt, output, status, started_at, finished_at, created_at
     FROM workflow_run_steps WHERE run_id = ? ORDER BY created_at ASC, id ASC`
  )

  return {
    async insertWorkflow(input: InsertWorkflowInput): Promise<WorkflowRecord> {
      const createdAt = nowIso()
      const record: WorkflowRecord = {
        id: newWorkflowId(),
        name: input.definition.name,
        definition: input.definition,
        createdAt,
        updatedAt: createdAt
      }
      insertWorkflowStmt.run(
        record.id,
        record.name,
        JSON.stringify(record.definition),
        record.createdAt,
        record.updatedAt
      )
      return record
    },

    async getWorkflow(id: string): Promise<WorkflowRecord | null> {
      const row = getWorkflowStmt.get(id) as WorkflowRow | undefined
      return row ? mapWorkflow(row) : null
    },

    async insertRun(input: InsertWorkflowRunInput): Promise<WorkflowRunRecord> {
      const workflow = await this.getWorkflow(input.workflowId)
      if (!workflow) throw new Error(`workflow not found: ${input.workflowId}`)
      const createdAt = nowIso()
      const record: WorkflowRunRecord = {
        id: newWorkflowRunId(),
        workflowId: input.workflowId,
        cursorAgentId: input.cursorAgentId ?? null,
        temporalWorkflowId: input.temporalWorkflowId ?? null,
        currentStepId: input.currentStepId ?? null,
        state: input.state ?? "pending",
        createdAt,
        updatedAt: createdAt
      }
      insertRunStmt.run(
        record.id,
        record.workflowId,
        record.cursorAgentId,
        record.temporalWorkflowId,
        record.currentStepId,
        record.state,
        record.createdAt,
        record.updatedAt
      )
      return record
    },

    async getRun(id: string): Promise<WorkflowRunRecord | null> {
      const row = getRunStmt.get(id) as RunRow | undefined
      return row ? mapRun(row) : null
    },

    async updateRun(id: string, patch: UpdateWorkflowRunInput): Promise<WorkflowRunRecord> {
      const existing = await this.getRun(id)
      if (!existing) throw new Error(`workflow run not found: ${id}`)
      const next: WorkflowRunRecord = {
        ...existing,
        cursorAgentId: patch.cursorAgentId !== undefined ? patch.cursorAgentId : existing.cursorAgentId,
        temporalWorkflowId:
          patch.temporalWorkflowId !== undefined ? patch.temporalWorkflowId : existing.temporalWorkflowId,
        currentStepId: patch.currentStepId !== undefined ? patch.currentStepId : existing.currentStepId,
        state: patch.state !== undefined ? patch.state : existing.state,
        updatedAt: nowIso()
      }
      updateRunStmt.run(
        next.cursorAgentId,
        next.temporalWorkflowId,
        next.currentStepId,
        next.state,
        next.updatedAt,
        next.id
      )
      return next
    },

    async insertRunStep(input: InsertWorkflowRunStepInput): Promise<WorkflowRunStepRecord> {
      const run = await this.getRun(input.runId)
      if (!run) throw new Error(`workflow run not found: ${input.runId}`)
      const createdAt = nowIso()
      const record: WorkflowRunStepRecord = {
        id: newWorkflowRunStepId(),
        runId: input.runId,
        stepId: input.stepId,
        cursorAgentId: input.cursorAgentId ?? null,
        prompt: input.prompt ?? null,
        output: input.output ?? null,
        status: input.status ?? "pending",
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
        createdAt
      }
      insertRunStepStmt.run(
        record.id,
        record.runId,
        record.stepId,
        record.cursorAgentId,
        record.prompt,
        record.output,
        record.status,
        record.startedAt,
        record.finishedAt,
        record.createdAt
      )
      return record
    },

    async listRunSteps(runId: string): Promise<WorkflowRunStepRecord[]> {
      const rows = listRunStepsStmt.all(runId) as RunStepRow[]
      return rows.map(mapRunStep)
    },

    async close(): Promise<void> {
      db.close()
    }
  }
}
