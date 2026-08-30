import { randomUUID } from "node:crypto"
import type { ConversationMode, CursorCloudCreateOptions } from "../domain/types.ts"
import {
  requireCloudRepos,
  type CloudAgentDriver,
  type CloudAgentHandle,
  type CloudSendResult
} from "./cloud-driver.ts"

export type FakeSendCall = {
  prompt: string
  mode: ConversationMode | undefined
}

export type FakeCloudDriver = CloudAgentDriver & {
  calls: Array<"create" | "resume">
  sends: FakeSendCall[]
  createdOptions: CursorCloudCreateOptions | undefined
  agentId: string | undefined
}

export const createFakeCloudDriver = (replies?: string[]): FakeCloudDriver => {
  const calls: Array<"create" | "resume"> = []
  const sends: FakeSendCall[] = []
  let createdOptions: CursorCloudCreateOptions | undefined
  let agentId: string | undefined
  let index = 0
  const nextText = (): string => {
    const reply = replies?.[index] ?? `{"decision":"PASS"}`
    index += 1
    return reply
  }
  const handleFor = (id: string): CloudAgentHandle => ({
    agentId: id,
    async send(prompt: string, mode?: ConversationMode): Promise<CloudSendResult> {
      sends.push({ prompt, mode })
      return { agentId: id, text: nextText(), status: "finished" }
    },
    async close(): Promise<void> {
      return
    }
  })
  const driver: FakeCloudDriver = {
    calls,
    sends,
    get createdOptions() {
      return createdOptions
    },
    get agentId() {
      return agentId
    },
    async create(options: CursorCloudCreateOptions): Promise<CloudAgentHandle> {
      requireCloudRepos(options)
      if (agentId) throw new Error("fake cloud driver already created an agent")
      calls.push("create")
      createdOptions = options
      agentId = `bc-fake-${randomUUID()}`
      return handleFor(agentId)
    },
    async resume(id: string, options: CursorCloudCreateOptions): Promise<CloudAgentHandle> {
      requireCloudRepos(options)
      if (!agentId) throw new Error("fake cloud driver resume before create")
      if (id !== agentId) throw new Error(`fake cloud driver resume mismatch: ${id}`)
      calls.push("resume")
      return handleFor(id)
    }
  }
  return driver
}
