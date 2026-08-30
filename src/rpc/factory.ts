import { isFactoryError, type FactoryErrorCode } from "../business/errors.ts"
import type { FactoryService } from "../business/factory.ts"
import { getFactoryService } from "../business/runtime.ts"

export type RpcError = {
  code: FactoryErrorCode
  message: string
  details?: Array<{ path: string; message: string }>
}

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcError }

const fail = (error: unknown): RpcResult<never> => {
  if (isFactoryError(error)) {
    const body: RpcError = { code: error.code, message: error.message }
    if (error.details) body.details = error.details
    return { ok: false, error: body }
  }
  const message = error instanceof Error ? error.message : "internal error"
  return { ok: false, error: { code: "internal_error", message } }
}

const wrap = async <T>(fn: () => Promise<T>): Promise<RpcResult<T>> => {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    return fail(error)
  }
}

export const createFactoryRpc = (service: FactoryService) => ({
  listWorkflows: (input: { showDeleted?: boolean } = {}) => wrap(() => service.listWorkflows(input)),
  getWorkflow: (input: { id: string; showDeleted?: boolean }) =>
    wrap(() => service.getWorkflow(input.id, { showDeleted: input.showDeleted })),
  createWorkflow: (input: { definition: unknown }) => wrap(() => service.createWorkflow(input.definition)),
  updateWorkflow: (input: { id: string; definition: unknown }) =>
    wrap(() => service.updateWorkflow(input.id, input.definition)),
  deleteWorkflow: (input: { id: string }) => wrap(() => service.deleteWorkflow(input.id)),
  listRuns: (input: { workflowId: string; showDeleted?: boolean }) =>
    wrap(() => service.listRuns(input.workflowId, { showDeleted: input.showDeleted })),
  startRun: (input: { workflowId: string; prompt?: string }) =>
    wrap(() => {
      const body: { prompt?: string } = {}
      if (input.prompt !== undefined) body.prompt = input.prompt
      return service.startWorkflowRun(input.workflowId, body)
    }),
  getRun: (input: { id: string }) => wrap(() => service.getRun(input.id))
})

export type FactoryRpc = ReturnType<typeof createFactoryRpc>

let rpcPromise: Promise<FactoryRpc> | undefined

export const getFactoryRpc = async (): Promise<FactoryRpc> => {
  if (!rpcPromise) {
    rpcPromise = getFactoryService().then((service) => createFactoryRpc(service))
  }
  return rpcPromise
}
