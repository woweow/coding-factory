import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./activities.ts"

const { implement, verify } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute"
})

export async function twoNodeWorkflow(ticket: string): Promise<string> {
  const implemented = await implement(ticket)
  return await verify(implemented)
}
