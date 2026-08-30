import type { WorkflowDefinition, WorkflowRunState } from "../domain/types.ts"
import type { CloudAgentDriver } from "../factory/cloud-driver.ts"
import { invokeAgent as runCloudAgent, type AgentInput } from "../factory/invoke-agent.ts"
import type { WorkflowStore } from "../storage/port.ts"

export type { AgentInput }

export type SetRunStateInput = {
  runId: string
  state: WorkflowRunState
  currentStepId?: string | null
}

export const createFactoryActivities = (store: WorkflowStore, driver: CloudAgentDriver) => ({
  async invokeAgent(input: AgentInput): Promise<Record<string, string>> {
    return runCloudAgent(store, driver, input)
  },
  async setRunState(input: SetRunStateInput): Promise<void> {
    const patch: { state: WorkflowRunState; currentStepId?: string | null } = { state: input.state }
    if (input.currentStepId !== undefined) patch.currentStepId = input.currentStepId
    await store.updateRun(input.runId, patch)
  }
})

export type FactoryActivities = ReturnType<typeof createFactoryActivities>

export type FactoryWorkflowArgs = {
  runId: string
  definition: WorkflowDefinition
  prompt: string
}

export const DEFAULT_RUN_PROMPT = "Begin."

export const factoryTemporalId = (runId: string): string => `factory-${runId}`
