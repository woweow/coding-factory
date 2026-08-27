import type { ConversationMode, CursorCloudCreateOptions } from "../domain/types.ts"

export type CloudGitInfo = {
  branches: Array<{ repoUrl: string; branch?: string; prUrl?: string }>
}

export type CloudSendResult = {
  agentId: string
  text: string
  status: "finished" | "error" | "cancelled"
  git?: CloudGitInfo
}

export type CloudAgentHandle = {
  readonly agentId: string
  send(prompt: string, mode?: ConversationMode): Promise<CloudSendResult>
  close(): Promise<void>
}

export type CloudAgentDriver = {
  create(options: CursorCloudCreateOptions): Promise<CloudAgentHandle>
  resume(agentId: string, options: CursorCloudCreateOptions): Promise<CloudAgentHandle>
}

export const requireCloudRepos = (options: CursorCloudCreateOptions): void => {
  if (!Array.isArray(options.cloud.repos) || options.cloud.repos.length < 1) {
    throw new Error("cloud.repos is required so the SDK cannot default to local")
  }
}

export const formatStepOutput = (text: string, git: CloudGitInfo | undefined): string => {
  if (!git) return text
  return `${text}\n\n[git] ${JSON.stringify(git)}`
}
