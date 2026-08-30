import { ApplicationFailure, proxyActivities } from "@temporalio/workflow"
import type { WorkflowDefinition, WorkflowRunState, WorkflowStep } from "../domain/types.ts"
import { agentInputForStep, executeRoutes, type AgentInput } from "../factory/execute.ts"

const { invokeAgent } = proxyActivities<{
  invokeAgent(input: AgentInput): Promise<Record<string, string>>
}>({
  startToCloseTimeout: "2 hours",
  retry: { maximumAttempts: 3 }
})

const { setRunState } = proxyActivities<{
  setRunState(input: {
    runId: string
    state: WorkflowRunState
    currentStepId?: string | null
  }): Promise<void>
}>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 5 }
})

const HOP_CAP = 32

const stepById = (definition: WorkflowDefinition, id: string): WorkflowStep => {
  const step = definition.steps.find((item) => item.id === id)
  if (!step) throw ApplicationFailure.nonRetryable(`unknown step ${id}`)
  return step
}

export async function factoryWorkflow(args: {
  runId: string
  definition: WorkflowDefinition
  prompt: string
}): Promise<string[]> {
  const path: string[] = []
  let current = stepById(args.definition, args.definition.entry)
  let incomingEdge = args.prompt
  try {
    for (let hop = 0; hop < HOP_CAP; hop++) {
      path.push(current.id)
      const routes = executeRoutes(current)
      const output = await invokeAgent(agentInputForStep(args.runId, current, incomingEdge))
      if (routes.length === 0) {
        await setRunState({ runId: args.runId, state: "completed", currentStepId: current.id })
        return path
      }
      const route = routes.find((candidate) => {
        if (candidate.match.kind === "always") return true
        return output[candidate.match.key] === candidate.match.value
      })
      if (!route) {
        throw ApplicationFailure.nonRetryable(
          `no route from ${current.id} for ${JSON.stringify(output)}`
        )
      }
      current = stepById(args.definition, route.to)
      incomingEdge = route.prompt
    }
    throw ApplicationFailure.nonRetryable("graph hop cap")
  } catch (error) {
    await setRunState({ runId: args.runId, state: "failed" })
    throw error
  }
}
