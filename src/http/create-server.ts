import { Buffer } from "node:buffer"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { createFactoryService, type StartRunFn } from "../business/factory.ts"
import { httpStatusFor, isFactoryError, type FactoryError } from "../business/errors.ts"
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

const sendFactoryError = (res: ServerResponse, error: FactoryError): void => {
  const body: HttpErrorBody = { error: error.code, message: error.message }
  if (error.details) body.details = error.details
  sendError(res, httpStatusFor(error.code), body)
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

const runBusiness = async (res: ServerResponse, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn()
  } catch (error) {
    if (isFactoryError(error)) {
      sendFactoryError(res, error)
      return
    }
    throw error
  }
}

export const createFactoryServer = (store: WorkflowStore, startRun?: StartRunFn): Server => {
  const service = createFactoryService(store, startRun)
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
          const parsed = await parseJsonBody(req, res)
          if (parsed === undefined) return
          await runBusiness(res, async () => {
            sendJson(res, 201, await service.createWorkflow(parsed))
          })
          return
        }
        if (method === "GET" && (pathname === "/workflows" || pathname === "/workflows/")) {
          const showDeleted = readShowDeleted(req, res)
          if (showDeleted === undefined) return
          await runBusiness(res, async () => {
            sendJson(res, 200, await service.listWorkflows({ showDeleted }))
          })
          return
        }
        const workflowRuns = pathname.match(/^\/workflows\/([^/]+)\/runs\/?$/)
        if (workflowRuns?.[1]) {
          const workflowId = decodeURIComponent(workflowRuns[1])
          if (method === "POST") {
            const parsed = await parseJsonBody(req, res)
            if (parsed === undefined) return
            await runBusiness(res, async () => {
              sendJson(res, 201, await service.startWorkflowRun(workflowId, parsed))
            })
            return
          }
          if (method === "GET") {
            const showDeleted = readShowDeleted(req, res)
            if (showDeleted === undefined) return
            await runBusiness(res, async () => {
              sendJson(res, 200, await service.listRuns(workflowId, { showDeleted }))
            })
            return
          }
        }
        if (method === "POST" && (pathname === "/run-workflow" || pathname === "/run-workflow/")) {
          const parsed = await parseJsonBody(req, res)
          if (parsed === undefined) return
          await runBusiness(res, async () => {
            sendJson(res, 201, await service.startWorkflowRunFromBody(parsed))
          })
          return
        }
        const runMatch = pathname.match(/^\/runs\/([^/]+)\/?$/)
        if (method === "GET" && runMatch?.[1]) {
          await runBusiness(res, async () => {
            sendJson(res, 200, await service.getRun(decodeURIComponent(runMatch[1])))
          })
          return
        }
        const idMatch = pathname.match(/^\/workflows\/([^/]+)\/?$/)
        if (idMatch?.[1]) {
          const id = decodeURIComponent(idMatch[1])
          if (method === "GET") {
            const showDeleted = readShowDeleted(req, res)
            if (showDeleted === undefined) return
            await runBusiness(res, async () => {
              sendJson(res, 200, await service.getWorkflow(id, { showDeleted }))
            })
            return
          }
          if (method === "PATCH") {
            const parsed = await parseJsonBody(req, res)
            if (parsed === undefined) return
            await runBusiness(res, async () => {
              sendJson(res, 200, await service.updateWorkflow(id, parsed))
            })
            return
          }
          if (method === "DELETE") {
            await runBusiness(res, async () => {
              await service.deleteWorkflow(id)
              sendNoContent(res)
            })
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
