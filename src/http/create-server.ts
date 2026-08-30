import { Buffer } from "node:buffer"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { WorkflowDefinition, WorkflowRecord, WorkflowRunRecord } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
import { DEFAULT_RUN_PROMPT, factoryTemporalId } from "../temporal/activities.ts"
import type { WorkflowStore } from "../storage/port.ts"

const MAX_BODY_BYTES = 1024 * 1024

export type HttpErrorBody = {
  error: string
  message: string
  details?: Array<{ path: string; message: string }>
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  })
  res.end(payload)
}

const sendNoContent = (res: ServerResponse): void => {
  res.writeHead(204)
  res.end()
}

const sendError = (res: ServerResponse, status: number, body: HttpErrorBody): void => {
  sendJson(res, status, body)
}

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("request body too large"), { code: "PAYLOAD_TOO_LARGE" as const })
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const workflowResponse = (record: WorkflowRecord) => ({
  id: record.id,
  name: record.name,
  definition: record.definition,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  deletedAt: record.deletedAt
})

const runListItem = (record: WorkflowRunRecord) => ({
  id: record.id,
  workflowId: record.workflowId,
  cursorAgentId: record.cursorAgentId,
  temporalWorkflowId: record.temporalWorkflowId,
  currentStepId: record.currentStepId,
  state: record.state,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
})

const runResponse = (record: WorkflowRunRecord, steps: Awaited<ReturnType<WorkflowStore["listRunSteps"]>>) => ({
  ...runListItem(record),
  steps
})

const pathOnly = (url: string): string => {
  const q = url.indexOf("?")
  return q === -1 ? url : url.slice(0, q)
}

const parseShowDeleted = (url: string): boolean | "invalid" => {
  const raw = new URL(url, "http://127.0.0.1").searchParams.get("showDeleted")
  if (raw === null || raw === "") return false
  if (raw === "true") return true
  if (raw === "false") return false
  return "invalid"
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseJsonBody = async (req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> => {
  let raw: string
  try {
    raw = await readBody(req)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "PAYLOAD_TOO_LARGE") {
      sendError(res, 413, { error: "payload_too_large", message: "request body must be at most 1MB" })
      return undefined
    }
    throw error
  }
  if (raw.trim() === "") return {}
  try {
    return JSON.parse(raw)
  } catch {
    sendError(res, 400, { error: "invalid_json", message: "request body is not valid JSON" })
    return undefined
  }
}

const readShowDeleted = (req: IncomingMessage, res: ServerResponse): boolean | undefined => {
  const parsed = parseShowDeleted(req.url ?? "/")
  if (parsed === "invalid") {
    sendError(res, 400, { error: "validation_error", message: "showDeleted must be true or false" })
    return undefined
  }
  return parsed
}

const loadVisibleWorkflow = async (
  store: WorkflowStore,
  id: string,
  showDeleted: boolean
): Promise<WorkflowRecord | null> => {
  const record = await store.getWorkflow(id)
  if (!record) return null
  if (record.deletedAt && !showDeleted) return null
  return record
}

const handleRegister = async (req: IncomingMessage, res: ServerResponse, store: WorkflowStore): Promise<void> => {
  const parsed = await parseJsonBody(req, res)
  if (parsed === undefined) return
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
    sendError(res, 400, { error: "invalid_json", message: "request body is required" })
    return
  }
  const result = validateWorkflowDefinition(parsed)
  if (!result.ok) {
    sendError(res, 400, {
      error: "validation_error",
      message: "workflow definition is invalid",
      details: result.issues
    })
    return
  }
  const record = await store.insertWorkflow({ definition: parsed as WorkflowDefinition })
  sendJson(res, 201, workflowResponse(record))
}

const handleListWorkflows = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: WorkflowStore
): Promise<void> => {
  const showDeleted = readShowDeleted(req, res)
  if (showDeleted === undefined) return
  const records = await store.listWorkflows({ showDeleted })
  sendJson(res, 200, records.map(workflowResponse))
}

const handleGetWorkflow = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: WorkflowStore,
  id: string
): Promise<void> => {
  const showDeleted = readShowDeleted(req, res)
  if (showDeleted === undefined) return
  const record = await loadVisibleWorkflow(store, id, showDeleted)
  if (!record) {
    sendError(res, 404, { error: "not_found", message: `workflow ${id} not found` })
    return
  }
  sendJson(res, 200, workflowResponse(record))
}

const handlePatchWorkflow = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: WorkflowStore,
  id: string
): Promise<void> => {
  const parsed = await parseJsonBody(req, res)
  if (parsed === undefined) return
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
    sendError(res, 400, { error: "invalid_json", message: "request body is required" })
    return
  }
  const result = validateWorkflowDefinition(parsed)
  if (!result.ok) {
    sendError(res, 400, {
      error: "validation_error",
      message: "workflow definition is invalid",
      details: result.issues
    })
    return
  }
  const updated = await store.updateWorkflow(id, { definition: parsed as WorkflowDefinition })
  if (!updated) {
    sendError(res, 404, { error: "not_found", message: `workflow ${id} not found` })
    return
  }
  sendJson(res, 200, workflowResponse(updated))
}

const handleDeleteWorkflow = async (res: ServerResponse, store: WorkflowStore, id: string): Promise<void> => {
  const found = await store.deleteWorkflow(id)
  if (!found) {
    sendError(res, 404, { error: "not_found", message: `workflow ${id} not found` })
    return
  }
  sendNoContent(res)
}

const parseRunPrompt = (
  parsed: unknown,
  res: ServerResponse
): string | undefined => {
  if (!isRecord(parsed)) {
    sendError(res, 400, { error: "invalid_json", message: "run body must be a JSON object" })
    return undefined
  }
  if ("apiKey" in parsed || "CURSOR_API_KEY" in parsed) {
    sendError(res, 400, { error: "validation_error", message: "api keys must come from CURSOR_API_KEY at runtime" })
    return undefined
  }
  if ("local" in parsed) {
    sendError(res, 400, { error: "validation_error", message: "agent.local is rejected on run requests" })
    return undefined
  }
  for (const key of Object.keys(parsed)) {
    if (key !== "prompt" && key !== "workflowId") {
      sendError(res, 400, { error: "validation_error", message: `unknown field "${key}"` })
      return undefined
    }
  }
  if (parsed.prompt === undefined) return DEFAULT_RUN_PROMPT
  if (typeof parsed.prompt !== "string" || parsed.prompt.trim() === "") {
    sendError(res, 400, { error: "validation_error", message: "prompt must be a non-empty string when set" })
    return undefined
  }
  return parsed.prompt
}

const handleStartRun = async (
  res: ServerResponse,
  store: WorkflowStore,
  startRun: StartRunFn | undefined,
  workflowId: string,
  prompt: string
): Promise<void> => {
  if (!startRun) {
    sendError(res, 503, { error: "unavailable", message: "run starter is not configured" })
    return
  }
  const workflow = await loadVisibleWorkflow(store, workflowId, false)
  if (!workflow) {
    sendError(res, 404, { error: "not_found", message: `workflow ${workflowId} not found` })
    return
  }
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
    sendError(res, 503, { error: "unavailable", message })
    return
  }
  const started = await store.getRun(run.id)
  if (!started) {
    sendError(res, 500, { error: "internal_error", message: "run vanished after start" })
    return
  }
  sendJson(res, 201, runResponse(started, []))
}

const handleListRuns = async (
  req: IncomingMessage,
  res: ServerResponse,
  store: WorkflowStore,
  workflowId: string
): Promise<void> => {
  const showDeleted = readShowDeleted(req, res)
  if (showDeleted === undefined) return
  const workflow = await loadVisibleWorkflow(store, workflowId, showDeleted)
  if (!workflow) {
    sendError(res, 404, { error: "not_found", message: `workflow ${workflowId} not found` })
    return
  }
  const runs = await store.listRuns(workflowId)
  sendJson(res, 200, runs.map(runListItem))
}

const handleGetRun = async (res: ServerResponse, store: WorkflowStore, id: string): Promise<void> => {
  const record = await store.getRun(id)
  if (!record) {
    sendError(res, 404, { error: "not_found", message: `run ${id} not found` })
    return
  }
  const steps = await store.listRunSteps(id)
  sendJson(res, 200, runResponse(record, steps))
}

type StartRunFn = (input: {
  runId: string
  temporalWorkflowId: string
  definition: WorkflowDefinition
  prompt: string
}) => Promise<void>

export const createFactoryServer = (store: WorkflowStore, startRun?: StartRunFn): Server => {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const method = req.method ?? "GET"
        const pathname = pathOnly(req.url ?? "/")
        if (method === "GET" && (pathname === "/health" || pathname === "/health/")) {
          sendJson(res, 200, { ok: true })
          return
        }
        if (method === "POST" && (pathname === "/workflows" || pathname === "/workflows/" || pathname === "/register-workflow")) {
          await handleRegister(req, res, store)
          return
        }
        if (method === "GET" && (pathname === "/workflows" || pathname === "/workflows/")) {
          await handleListWorkflows(req, res, store)
          return
        }
        const workflowRuns = pathname.match(/^\/workflows\/([^/]+)\/runs\/?$/)
        if (workflowRuns?.[1]) {
          const workflowId = decodeURIComponent(workflowRuns[1])
          if (method === "POST") {
            const parsed = await parseJsonBody(req, res)
            if (parsed === undefined) return
            const prompt = parseRunPrompt(parsed, res)
            if (prompt === undefined) return
            await handleStartRun(res, store, startRun, workflowId, prompt)
            return
          }
          if (method === "GET") {
            await handleListRuns(req, res, store, workflowId)
            return
          }
        }
        if (method === "POST" && (pathname === "/run-workflow" || pathname === "/run-workflow/")) {
          const parsed = await parseJsonBody(req, res)
          if (parsed === undefined) return
          const prompt = parseRunPrompt(parsed, res)
          if (prompt === undefined) return
          if (!isRecord(parsed) || typeof parsed.workflowId !== "string" || parsed.workflowId.trim() === "") {
            sendError(res, 400, { error: "validation_error", message: "workflowId is required" })
            return
          }
          await handleStartRun(res, store, startRun, parsed.workflowId, prompt)
          return
        }
        const runMatch = pathname.match(/^\/runs\/([^/]+)\/?$/)
        if (method === "GET" && runMatch?.[1]) {
          await handleGetRun(res, store, decodeURIComponent(runMatch[1]))
          return
        }
        const idMatch = pathname.match(/^\/workflows\/([^/]+)\/?$/)
        if (idMatch?.[1]) {
          const id = decodeURIComponent(idMatch[1])
          if (method === "GET") {
            await handleGetWorkflow(req, res, store, id)
            return
          }
          if (method === "PATCH") {
            await handlePatchWorkflow(req, res, store, id)
            return
          }
          if (method === "DELETE") {
            await handleDeleteWorkflow(res, store, id)
            return
          }
        }
        sendError(res, 404, { error: "not_found", message: "route not found" })
      } catch (error) {
        const message = error instanceof Error ? error.message : "internal error"
        sendError(res, 500, { error: "internal_error", message })
      }
    })()
  })
}
