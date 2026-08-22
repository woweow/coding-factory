import { NativeConnection, Worker } from "@temporalio/worker"
import { loadClientConnectConfig } from "@temporalio/envconfig"
import { fileURLToPath } from "node:url"
import * as activities from "./activities.ts"
import { TASK_QUEUE } from "./shared.ts"

async function main(): Promise<void> {
  const config = loadClientConnectConfig()
  const connection = await NativeConnection.connect(config.connectionOptions)
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities,
    taskQueue: TASK_QUEUE
  })
  console.log(`Worker polling ${TASK_QUEUE}`)
  await worker.run()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
