import { Client, Connection } from "@temporalio/client"
import { loadClientConnectConfig } from "@temporalio/envconfig"
import { randomUUID } from "node:crypto"
import { TASK_QUEUE } from "./shared.ts"
import { twoNodeWorkflow } from "./workflows.ts"

async function main(): Promise<void> {
  const ticket = process.argv[2] ?? "two-node demo"
  const config = loadClientConnectConfig()
  const connection = await Connection.connect(config.connectionOptions)
  const client = new Client({ connection, namespace: config.namespace })
  const result = await client.workflow.execute(twoNodeWorkflow, {
    workflowId: `two-node-${randomUUID()}`,
    taskQueue: TASK_QUEUE,
    args: [ticket]
  })
  console.log(result)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
