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
  updatedAt: record.updatedAt
})

const runResponse = (record: WorkflowRunRecord, steps: Awaited<ReturnType<WorkflowStore["listRunSteps"]>>) => ({
  id: record.id,
  workflowId: record.workflowId,
  cursorAgentId: record.cursorAgentId,
  temporalWorkflowId: record.temporalWorkflowId,
  currentStepId: record.currentStepId,
  state: record.state,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  steps
})

const pathOnly = (url: string): string => {
  const q = url.indexOf("?")
  return q === -1 ? url : url.slice(0, q)
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
  const record = await store.insertWorkflow({ definition: result.definition })
  sendJson(res, 201, workflowResponse(record))
}

const handleGetWorkflow = async (res: ServerResponse, store: WorkflowStore, id: string): Promise<void> => {
  const record = await store.getWorkflow(id)
  if (!record) {
    sendError(res, 404, { error: "not_found", message: `workflow ${id} not found` })
    return
  }
  sendJson(res, 200, workflowResponse(record))
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
  const workflow = await store.getWorkflow(workflowId)
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
        const workflowRuns = pathname.match(/^\/workflows\/([^/]+)\/runs\/?$/)
        if (method === "POST" && workflowRuns?.[1]) {
          const parsed = await parseJsonBody(req, res)
          if (parsed === undefined) return
          const prompt = parseRunPrompt(parsed, res)
          if (prompt === undefined) return
          await handleStartRun(res, store, startRun, decodeURIComponent(workflowRuns[1]), prompt)
          return
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
        if (method === "GET") {
          const idMatch = pathname.match(/^\/workflows\/([^/]+)\/?$/)
          if (idMatch?.[1]) {
            await handleGetWorkflow(res, store, decodeURIComponent(idMatch[1]))
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
