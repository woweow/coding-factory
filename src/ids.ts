import { randomUUID } from "node:crypto"

export const newWorkflowId = (): string => `wf_${randomUUID()}`
export const newWorkflowRunId = (): string => `run_${randomUUID()}`
export const newWorkflowRunStepId = (): string => `rs_${randomUUID()}`
