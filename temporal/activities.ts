import { invokeAgent as runAgent, type AgentInput } from "../agent.ts"

export type { AgentInput }

export async function invokeAgent(input: AgentInput): Promise<Record<string, string>> {
  return runAgent(input)
}
