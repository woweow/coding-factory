import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { WorkflowRecord, WorkflowRunRecord, WorkflowRunStepRecord } from "../domain/types.ts"
import { newWorkflowId, newWorkflowRunId, newWorkflowRunStepId } from "../ids.ts"
import { readFactoryFile } from "../paths.ts"
import type {
  InsertWorkflowInput,
  InsertWorkflowRunInput,
  InsertWorkflowRunStepInput,
  ListWorkflowsQuery,
  UpdateWorkflowRunInput,
  WorkflowStore
} from "./port.ts"
import { mapRun, mapRunStep, mapWorkflow, nowIso, type RunRow, type RunStepRow, type WorkflowRow } from "./workflow-map.ts"

const SCHEMA_SQL = readFactoryFile("src/storage/schema.sql")

const WORKFLOW_COLUMNS = "id, name, definition, created_at, updated_at, deleted_at"
const RUN_COLUMNS =
  "id, workflow_id, cursor_agent_id, temporal_workflow_id, current_step_id, state, created_at, updated_at"
const RUN_STEP_COLUMNS =
  "id, run_id, step_id, cursor_agent_id, prompt, output, status, started_at, finished_at, created_at"

const ensureParentDir = (sqlitePath: string): void => {
  if (sqlitePath === ":memory:") return
  mkdirSync(dirname(sqlitePath), { recursive: true })
}

const ensureColumn = (db: DatabaseSync, table: string, column: string, type: string): void => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

export const createSqliteWorkflowStore = (sqlitePath: string): WorkflowStore => {
  ensureParentDir(sqlitePath)
  const db = new DatabaseSync(sqlitePath)
  db.exec("PRAGMA foreign_keys = ON")
  if (sqlitePath !== ":memory:") db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec(SCHEMA_SQL)
  ensureColumn(db, "workflows", "deleted_at", "TEXT")

  const insertWorkflowStmt = db.prepare(
    `INSERT INTO workflows (${WORKFLOW_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const listWorkflowsStmt = db.prepare(
    `SELECT ${WORKFLOW_COLUMNS} FROM workflows WHERE deleted_at IS NULL ORDER BY created_at ASC, id ASC`
  )
  const listWorkflowsIncludingDeletedStmt = db.prepare(
    `SELECT ${WORKFLOW_COLUMNS} FROM workflows ORDER BY created_at ASC, id ASC`
  )
  const getWorkflowStmt = db.prepare(`SELECT ${WORKFLOW_COLUMNS} FROM workflows WHERE id = ?`)
  const updateWorkflowStmt = db.prepare(
    `UPDATE workflows SET name = ?, definition = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`
  )
  const deleteWorkflowStmt = db.prepare(
    `UPDATE workflows SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
  )
  const insertRunStmt = db.prepare(
    `INSERT INTO workflow_runs (${RUN_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const listRunsStmt = db.prepare(
    `SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at ASC, id ASC`
  )
  const getRunStmt = db.prepare(`SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE id = ?`)
  const updateRunStmt = db.prepare(
    `UPDATE workflow_runs
     SET cursor_agent_id = ?, temporal_workflow_id = ?, current_step_id = ?, state = ?, updated_at = ?
     WHERE id = ?`
  )
  const insertRunStepStmt = db.prepare(
    `INSERT INTO workflow_run_steps (${RUN_STEP_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const listRunStepsStmt = db.prepare(
    `SELECT ${RUN_STEP_COLUMNS} FROM workflow_run_steps WHERE run_id = ? ORDER BY created_at ASC, id ASC`
  )

  const store: WorkflowStore = {
    async insertWorkflow(input: InsertWorkflowInput): Promise<WorkflowRecord> {
      const createdAt = nowIso()
      const record: WorkflowRecord = {
        id: newWorkflowId(),
        name: input.definition.name,
        definition: input.definition,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
      }
      insertWorkflowStmt.run(
        record.id,
        record.name,
        JSON.stringify(record.definition),
        record.createdAt,
        record.updatedAt,
        record.deletedAt
      )
      return record
    },

    async listWorkflows(query?: ListWorkflowsQuery): Promise<WorkflowRecord[]> {
      const rows = (query?.showDeleted ? listWorkflowsIncludingDeletedStmt.all() : listWorkflowsStmt.all()) as WorkflowRow[]
      return rows.map(mapWorkflow)
    },

    async getWorkflow(id: string): Promise<WorkflowRecord | null> {
      const row = getWorkflowStmt.get(id) as WorkflowRow | undefined
      return row ? mapWorkflow(row) : null
    },

    async updateWorkflow(id: string, input: InsertWorkflowInput): Promise<WorkflowRecord | null> {
      const existing = await store.getWorkflow(id)
      if (!existing || existing.deletedAt) return null
      const updatedAt = nowIso()
      updateWorkflowStmt.run(input.definition.name, JSON.stringify(input.definition), updatedAt, id)
      return {
        ...existing,
        name: input.definition.name,
        definition: input.definition,
        updatedAt
      }
    },

    async deleteWorkflow(id: string): Promise<boolean> {
      const existing = await store.getWorkflow(id)
      if (!existing) return false
      if (existing.deletedAt) return true
      const deletedAt = nowIso()
      deleteWorkflowStmt.run(deletedAt, deletedAt, id)
      return true
    },

    async insertRun(input: InsertWorkflowRunInput): Promise<WorkflowRunRecord> {
      const workflow = await store.getWorkflow(input.workflowId)
      if (!workflow || workflow.deletedAt) throw new Error(`workflow not found: ${input.workflowId}`)
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

    async listRuns(workflowId: string): Promise<WorkflowRunRecord[]> {
      const rows = listRunsStmt.all(workflowId) as RunRow[]
      return rows.map(mapRun)
    },

    async getRun(id: string): Promise<WorkflowRunRecord | null> {
      const row = getRunStmt.get(id) as RunRow | undefined
      return row ? mapRun(row) : null
    },

    async updateRun(id: string, patch: UpdateWorkflowRunInput): Promise<WorkflowRunRecord> {
      const existing = await store.getRun(id)
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
      const run = await store.getRun(input.runId)
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

  return store
}
