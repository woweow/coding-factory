import { Client, Connection } from "@temporalio/client"
import { loadClientConnectConfig } from "@temporalio/envconfig"
import { randomUUID } from "node:crypto"
import { branchGraph } from "../graph.ts"
import { TASK_QUEUE } from "./shared.ts"
import { graphWorkflow } from "./workflows.ts"

export async function runBranchGraph(edgePrompt: string): Promise<string[]> {
  const config = loadClientConnectConfig()
  const connection = await Connection.connect(config.connectionOptions)
  const client = new Client({ connection, namespace: config.namespace })
  return client.workflow.execute(graphWorkflow, {
    workflowId: `graph-${randomUUID()}`,
    taskQueue: TASK_QUEUE,
    args: [branchGraph, edgePrompt]
  })
}

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? "Implement this feature request."
  const path = await runBranchGraph(prompt)
  console.log(path.join(" -> "))
}

const isMain = process.argv[1]?.endsWith("client.ts") || process.argv[1]?.endsWith("client.js")
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
