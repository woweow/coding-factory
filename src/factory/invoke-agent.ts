import { ApplicationFailure } from "@temporalio/activity"
import { jsonToNodeOrThrow } from "../codec/index.ts"
import type { ConversationMode, WorkflowRoute } from "../domain/types.ts"
import { formatStepOutput, type CloudAgentDriver } from "./cloud-driver.ts"
import { buildStepPrompt, parseAgentOutput } from "./parse-output.ts"
import type { WorkflowStore } from "../storage/port.ts"

export type AgentInput = {
  nodeId: string
  systemPrompt: string
  edgePrompt: string
  routes: WorkflowRoute[]
  runId: string
  mode?: ConversationMode
}

export const invokeAgent = async (
  store: WorkflowStore,
  driver: CloudAgentDriver,
  input: AgentInput
): Promise<Record<string, string>> => {
  const run = await store.getRun(input.runId)
  if (!run) throw new Error(`workflow run not found: ${input.runId}`)
  const workflow = await store.getWorkflow(run.workflowId)
  if (!workflow) throw new Error(`workflow not found: ${run.workflowId}`)
  const graph = jsonToNodeOrThrow(workflow.definition)
  const prompt = buildStepPrompt(input.systemPrompt, input.edgePrompt)
  const startedAt = new Date().toISOString()
  const existingAgentId = run.cursorAgentId
  const handle = existingAgentId
    ? await driver.resume(existingAgentId, graph.agent)
    : await driver.create(graph.agent)
  try {
    const cursorAgentId = handle.agentId
    await store.updateRun(input.runId, {
      cursorAgentId,
      currentStepId: input.nodeId,
      state: "running"
    })
    const result = await handle.send(prompt, input.mode)
    const finishedAt = new Date().toISOString()
    let output: Record<string, string>
    try {
      output = parseAgentOutput(result.text, input.routes)
    } catch (error) {
      await store.insertRunStep({
        runId: input.runId,
        stepId: input.nodeId,
        cursorAgentId,
        prompt,
        output: formatStepOutput(result.text, result.git),
        status: "failed",
        startedAt,
        finishedAt
      })
      throw ApplicationFailure.nonRetryable(
        error instanceof Error ? error.message : "failed to parse JSON object from assistant text"
      )
    }
    await store.insertRunStep({
      runId: input.runId,
      stepId: input.nodeId,
      cursorAgentId,
      prompt,
      output: formatStepOutput(result.text, result.git),
      status: "completed",
      startedAt,
      finishedAt
    })
    return output
  } finally {
    await handle.close()
  }
}
