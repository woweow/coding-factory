import { NativeConnection, Worker } from "@temporalio/worker"
import { loadClientConnectConfig } from "@temporalio/envconfig"
import { fileURLToPath } from "node:url"
import { createFakeCloudDriver } from "../factory/fake-driver.ts"
import { createSdkCloudDriver } from "../factory/sdk-driver.ts"
import { openWorkflowStore } from "../storage/open.ts"
import { createFactoryActivities } from "./activities.ts"
import { FACTORY_TASK_QUEUE } from "./shared.ts"

async function main(): Promise<void> {
  const { store, kind, location } = await openWorkflowStore()
  const useFake = process.env.FACTORY_AGENT_DRIVER === "fake"
  const driver = useFake ? createFakeCloudDriver() : createSdkCloudDriver()
  const config = loadClientConnectConfig()
  const connection = await NativeConnection.connect(config.connectionOptions)
  const worker = await Worker.create({
    connection,
    namespace: config.namespace,
    workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
    activities: createFactoryActivities(store, driver),
    taskQueue: FACTORY_TASK_QUEUE
  })
  console.log(`factory worker polling ${FACTORY_TASK_QUEUE}`)
  console.log(`${kind}: ${location}`)
  console.log(`agent driver: ${useFake ? "fake" : "sdk"}`)
  await worker.run()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
