import { Agent, type SDKAgent } from "@cursor/sdk"
import type { AgentOptions } from "@cursor/sdk"
import type { ConversationMode, CursorCloudCreateOptions } from "../domain/types.ts"
import {
  requireCloudRepos,
  type CloudAgentDriver,
  type CloudAgentHandle,
  type CloudSendResult
} from "./cloud-driver.ts"

const requireApiKey = (): string => {
  const apiKey = process.env.CURSOR_API_KEY
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("CURSOR_API_KEY is required at runtime and is never stored")
  }
  return apiKey
}

const toSdkOptions = (agent: CursorCloudCreateOptions, apiKey: string): AgentOptions => {
  requireCloudRepos(agent)
  const options: AgentOptions = {
    apiKey,
    model: agent.model,
    cloud: agent.cloud
  }
  if (agent.name) options.name = agent.name
  if (agent.mode) options.mode = agent.mode
  return options
}

const sendAndWait = async (
  sdkAgent: SDKAgent,
  prompt: string,
  mode?: ConversationMode
): Promise<CloudSendResult> => {
  const run = mode ? await sdkAgent.send(prompt, { mode }) : await sdkAgent.send(prompt)
  const result = await run.wait()
  if (result.status !== "finished") {
    throw new Error(result.error?.message ?? `cloud agent run ${result.status}`)
  }
  return {
    agentId: sdkAgent.agentId,
    text: result.result ?? "",
    status: result.status,
    git: result.git
  }
}

const wrapHandle = (sdkAgent: SDKAgent, options: CursorCloudCreateOptions): CloudAgentHandle => {
  requireCloudRepos(options)
  return {
    agentId: sdkAgent.agentId,
    send(prompt: string, mode?: ConversationMode): Promise<CloudSendResult> {
      return sendAndWait(sdkAgent, prompt, mode)
    },
    async close(): Promise<void> {
      await sdkAgent[Symbol.asyncDispose]()
    }
  }
}

export const createSdkCloudDriver = (): CloudAgentDriver => ({
  async create(options: CursorCloudCreateOptions): Promise<CloudAgentHandle> {
    return wrapHandle(await Agent.create(toSdkOptions(options, requireApiKey())), options)
  },
  async resume(agentId: string, options: CursorCloudCreateOptions): Promise<CloudAgentHandle> {
    return wrapHandle(await Agent.resume(agentId, toSdkOptions(options, requireApiKey())), options)
  }
})
