import { Buffer } from "node:buffer"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { WorkflowRecord } from "../domain/types.ts"
import { validateWorkflowDefinition } from "../domain/validate.ts"
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

const pathOnly = (url: string): string => {
  const q = url.indexOf("?")
  return q === -1 ? url : url.slice(0, q)
}

const workflowIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/workflows\/([^/]+)\/?$/)
  if (!match || match[1] === undefined || match[1] === "") return undefined
  return decodeURIComponent(match[1])
}

const handleRegister = async (req: IncomingMessage, res: ServerResponse, store: WorkflowStore): Promise<void> => {
  let raw: string
  try {
    raw = await readBody(req)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "PAYLOAD_TOO_LARGE") {
      sendError(res, 413, { error: "payload_too_large", message: "request body must be at most 1MB" })
      return
    }
    throw error
  }
  if (raw.trim() === "") {
    sendError(res, 400, { error: "invalid_json", message: "request body is required" })
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendError(res, 400, { error: "invalid_json", message: "request body is not valid JSON" })
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

export const createFactoryServer = (store: WorkflowStore): Server => {
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
        if (method === "GET") {
          const id = workflowIdFromPath(pathname)
          if (id) {
            await handleGetWorkflow(res, store, id)
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
