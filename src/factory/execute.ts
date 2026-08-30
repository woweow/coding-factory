import type { ConversationMode, OutputMatch, WorkflowRoute, WorkflowStep } from "../domain/types.ts"

export const DEFAULT_SYSTEM_PROMPT = ""
export const DEFAULT_ROUTE_PROMPT = ""
export const DEFAULT_ROUTE_MATCH: OutputMatch = { kind: "always" }

export type ExecutableRoute = {
  to: string
  prompt: string
  match: OutputMatch
}

export type AgentInput = {
  nodeId: string
  systemPrompt: string
  edgePrompt: string
  routes: ExecutableRoute[]
  runId: string
  mode?: ConversationMode
}

export const executeSystemPrompt = (step: WorkflowStep): string => step.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

export const executeRoute = (route: WorkflowRoute): ExecutableRoute => ({
  to: route.to,
  prompt: route.prompt ?? DEFAULT_ROUTE_PROMPT,
  match: route.match ?? DEFAULT_ROUTE_MATCH
})

export const executeRoutes = (step: WorkflowStep): ExecutableRoute[] => (step.routes ?? []).map(executeRoute)

export const agentInputForStep = (runId: string, step: WorkflowStep, incomingEdge: string): AgentInput => {
  const input: AgentInput = {
    runId,
    nodeId: step.id,
    systemPrompt: executeSystemPrompt(step),
    edgePrompt: incomingEdge,
    routes: executeRoutes(step)
  }
  if (step.mode !== undefined) input.mode = step.mode
  return input
}
