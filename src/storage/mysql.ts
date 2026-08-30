import mysql from "mysql2/promise"
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

const SCHEMA_SQL = readFactoryFile("src/storage/schema.mysql.sql")

const WORKFLOW_COLUMNS = "id, name, definition, created_at, updated_at, deleted_at"
const RUN_COLUMNS =
  "id, workflow_id, cursor_agent_id, temporal_workflow_id, current_step_id, state, created_at, updated_at"
const RUN_STEP_COLUMNS =
  "id, run_id, step_id, cursor_agent_id, prompt, output, status, started_at, finished_at, created_at"

type MysqlPoolConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const splitSqlStatements = (sql: string): string[] =>
  sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

const firstRow = <T>(rows: unknown): T | undefined => {
  if (!Array.isArray(rows) || rows.length === 0) return undefined
  return rows[0] as T
}

const asRows = <T>(rows: unknown): T[] => (Array.isArray(rows) ? (rows as T[]) : [])

export const parseMysqlUrl = (databaseUrl: string): MysqlPoolConfig => {
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error("DATABASE_URL is not a valid URL")
  }
  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mysql2:") {
    throw new Error("DATABASE_URL must be a mysql:// URL")
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim()
  if (!database) throw new Error("DATABASE_URL must include a database name")
  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database
  }
}

const migrateMysql = async (pool: mysql.Pool): Promise<void> => {
  for (const statement of splitSqlStatements(SCHEMA_SQL)) {
    await pool.query(statement)
  }
  const [cols] = await pool.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workflows' AND COLUMN_NAME = 'deleted_at'`
  )
  if (asRows(cols).length === 0) {
    await pool.query("ALTER TABLE workflows ADD COLUMN deleted_at VARCHAR(40) NULL")
  }
}

export const createMysqlWorkflowStore = async (databaseUrl: string): Promise<WorkflowStore> => {
  const config = parseMysqlUrl(databaseUrl)
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10
  })
  try {
    await pool.query("SELECT 1")
    await migrateMysql(pool)
  } catch (error) {
    await pool.end()
    const message = error instanceof Error ? error.message : "failed to connect to MySQL"
    throw new Error(`MySQL store failed: ${message}`)
  }

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
      await pool.execute(
        `INSERT INTO workflows (${WORKFLOW_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
        [record.id, record.name, JSON.stringify(record.definition), record.createdAt, record.updatedAt, record.deletedAt]
      )
      return record
    },

    async listWorkflows(query?: ListWorkflowsQuery): Promise<WorkflowRecord[]> {
      const sql = query?.showDeleted
        ? `SELECT ${WORKFLOW_COLUMNS} FROM workflows ORDER BY created_at ASC, id ASC`
        : `SELECT ${WORKFLOW_COLUMNS} FROM workflows WHERE deleted_at IS NULL ORDER BY created_at ASC, id ASC`
      const [rows] = await pool.execute(sql)
      return asRows<WorkflowRow>(rows).map(mapWorkflow)
    },

    async getWorkflow(id: string): Promise<WorkflowRecord | null> {
      const [rows] = await pool.execute(`SELECT ${WORKFLOW_COLUMNS} FROM workflows WHERE id = ?`, [id])
      const row = firstRow<WorkflowRow>(rows)
      return row ? mapWorkflow(row) : null
    },

    async updateWorkflow(id: string, input: InsertWorkflowInput): Promise<WorkflowRecord | null> {
      const existing = await store.getWorkflow(id)
      if (!existing || existing.deletedAt) return null
      const updatedAt = nowIso()
      await pool.execute(
        `UPDATE workflows SET name = ?, definition = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        [input.definition.name, JSON.stringify(input.definition), updatedAt, id]
      )
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
      await pool.execute(`UPDATE workflows SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, [
        deletedAt,
        deletedAt,
        id
      ])
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
      await pool.execute(`INSERT INTO workflow_runs (${RUN_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        record.id,
        record.workflowId,
        record.cursorAgentId,
        record.temporalWorkflowId,
        record.currentStepId,
        record.state,
        record.createdAt,
        record.updatedAt
      ])
      return record
    },

    async listRuns(workflowId: string): Promise<WorkflowRunRecord[]> {
      const [rows] = await pool.execute(
        `SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at ASC, id ASC`,
        [workflowId]
      )
      return asRows<RunRow>(rows).map(mapRun)
    },

    async getRun(id: string): Promise<WorkflowRunRecord | null> {
      const [rows] = await pool.execute(`SELECT ${RUN_COLUMNS} FROM workflow_runs WHERE id = ?`, [id])
      const row = firstRow<RunRow>(rows)
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
      await pool.execute(
        `UPDATE workflow_runs
         SET cursor_agent_id = ?, temporal_workflow_id = ?, current_step_id = ?, state = ?, updated_at = ?
         WHERE id = ?`,
        [next.cursorAgentId, next.temporalWorkflowId, next.currentStepId, next.state, next.updatedAt, next.id]
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
      await pool.execute(`INSERT INTO workflow_run_steps (${RUN_STEP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
      ])
      return record
    },

    async listRunSteps(runId: string): Promise<WorkflowRunStepRecord[]> {
      const [rows] = await pool.execute(
        `SELECT ${RUN_STEP_COLUMNS} FROM workflow_run_steps WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
        [runId]
      )
      return asRows<RunStepRow>(rows).map(mapRunStep)
    },

    async close(): Promise<void> {
      await pool.end()
    }
  }

  return store
}
