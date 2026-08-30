"use server"

import { getFactoryRpc, type RpcResult } from "@factory/rpc/factory"

const parseDefinition = (jsonText: string): RpcResult<unknown> => {
  try {
    return { ok: true, data: JSON.parse(jsonText) as unknown }
  } catch {
    return { ok: false, error: { code: "invalid_json", message: "request body is not valid JSON" } }
  }
}

export const listWorkflowsAction = async (showDeleted: boolean) => {
  const rpc = await getFactoryRpc()
  return rpc.listWorkflows({ showDeleted })
}

export const getWorkflowAction = async (id: string, showDeleted: boolean) => {
  const rpc = await getFactoryRpc()
  return rpc.getWorkflow({ id, showDeleted })
}

export const createWorkflowAction = async (jsonText: string) => {
  const parsed = parseDefinition(jsonText)
  if (!parsed.ok) return parsed
  const rpc = await getFactoryRpc()
  return rpc.createWorkflow({ definition: parsed.data })
}

export const updateWorkflowAction = async (id: string, jsonText: string) => {
  const parsed = parseDefinition(jsonText)
  if (!parsed.ok) return parsed
  const rpc = await getFactoryRpc()
  return rpc.updateWorkflow({ id, definition: parsed.data })
}

export const deleteWorkflowAction = async (id: string) => {
  const rpc = await getFactoryRpc()
  return rpc.deleteWorkflow({ id })
}

export const listRunsAction = async (workflowId: string, showDeleted: boolean) => {
  const rpc = await getFactoryRpc()
  return rpc.listRuns({ workflowId, showDeleted })
}

export const startRunAction = async (workflowId: string, prompt?: string) => {
  const rpc = await getFactoryRpc()
  if (prompt === undefined || prompt.trim() === "") return rpc.startRun({ workflowId })
  return rpc.startRun({ workflowId, prompt })
}

export const getRunAction = async (id: string) => {
  const rpc = await getFactoryRpc()
  return rpc.getRun({ id })
}
